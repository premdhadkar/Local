import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [users, setUsers] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [userStatuses, setUserStatuses] = useState({});
  const [isSearching, setIsSearching] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [filterOffice, setFilterOffice] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCallsOpen, setIsCallsOpen] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileOfficeName, setProfileOfficeName] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);

  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [downloadedImages, setDownloadedImages] = useState({});
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  // WebRTC Call State
  const [callState, setCallState] = useState(null);
  const [incomingCallData, setIncomingCallData] = useState(null);
  const [callType, setCallType] = useState('audio');
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteMediaRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const callPeerIdRef = useRef(null);
  const ringtoneRef = useRef(null);
  
  const pendingCandidatesRef = useRef([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const mixedAudioContextRef = useRef(null);

  const [socket, setSocket] = useState(null);
  const fileInputRef = useRef(null);
  const selectedUserRef = useRef(null);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);
  const messagesEndRef = useRef(null);

  const getStatusColor = (userId) => {
    const st = userStatuses[userId];
    if (!st || st.connectionStatus === 'offline') return '#888'; // Gray
    if (st.inCall) return '#dc3545'; // Red
    if (st.customStatus === 'busy') return '#fd7e14'; // Orange
    return '#28a745'; // Green
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  const fetchChats = () => {
    if (token) {
      axios.get(`/api/chats`, { headers: { Authorization: `Bearer ${token}` }})
        .then(res => setActiveChats(res.data));
    }
  };

  useEffect(() => {
    const handlePaste = (e) => {
      if (!selectedUser) return;
      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const file = item.getAsFile();
          if (file) {
            setAttachedFile(file);
            setAttachedFilePreview(URL.createObjectURL(file));
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedUser]);

  useEffect(() => {
    if (token && user) {
      const newSocket = io("");
      setSocket(newSocket);
      
      // Re-register on every connect to handle server restarts or background disconnections
      newSocket.on('connect', () => {
        newSocket.emit('register', user.id);
      });
      if (newSocket.connected) {
        newSocket.emit('register', user.id);
      }

      newSocket.on('user_statuses', (statuses) => {
        setUserStatuses(statuses);
      });

      newSocket.on('user_status_update', ({ userId, status }) => {
        setUserStatuses(prev => ({ ...prev, [userId]: status }));
      });

      newSocket.on('new_message', (msg) => {
        if (selectedUserRef.current && (msg.senderId === selectedUserRef.current.id || msg.receiverId === selectedUserRef.current.id)) {
          setMessages(prev => [...prev, msg]);
        }
        fetchChats();
      });

      newSocket.on('call_user', (data) => {
        setIncomingCallData(data);
        setCallState('receiving');
        if (ringtoneRef.current) {
          ringtoneRef.current.currentTime = 0;
          ringtoneRef.current.play().catch(e => console.error("Ringtone error", e));
        }
        if ("Notification" in window && Notification.permission === "granted") {
          const notif = new Notification(`Incoming ${data.callerInfo.callType === 'video' ? 'Video' : 'Audio'} Call`, {
            body: `From ${data.callerInfo.firstName} ${data.callerInfo.lastName}`
          });
          notif.onclick = () => {
            window.focus();
          };
        }
      });

      newSocket.on('call_accepted', async (signal) => {
        setCallState('in_call');
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          // Apply buffered candidates
          while(pendingCandidatesRef.current.length > 0) {
            const candidate = pendingCandidatesRef.current.shift();
            try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch(e) { console.error('Error adding buffered ice candidate', e); }
          }
        }
      });

      newSocket.on('call_rejected', () => {
        endCallLocally();
      });

      newSocket.on('call_ended', () => {
        endCallLocally();
      });

      newSocket.on('ice_candidate', async (candidate) => {
        if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch(e) { console.error('Error adding received ice candidate', e); }
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      });

      axios.get(`/api/users`, { headers: { Authorization: `Bearer ${token}` }})
        .then(res => setUsers(res.data.filter(u => u.id !== user.id)));

      fetchChats();

      return () => newSocket.close();
    }
  }, [token, user]);

  useEffect(() => {
    if (selectedUser && token) {
      axios.get(`/api/messages/${selectedUser.id}`, { headers: { Authorization: `Bearer ${token}` }})
        .then(res => setMessages(res.data));
    }
  }, [selectedUser, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`/api/login`, { username, password });
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    } catch (err) {
      alert(err.response?.data?.error || 'Login failed. Check credentials.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachedFile) return;

    let fileUrl = null;
    if (attachedFile) {
      const formData = new FormData();
      formData.append('file', attachedFile);
      const res = await axios.post(`/api/upload`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      fileUrl = res.data.fileUrl;
    }

    const msgData = {
      senderId: user.id,
      receiverId: selectedUser.id,
      text: newMessage,
      fileUrl
    };

    socket.emit('private_message', msgData);
    if (fileUrl) {
      setDownloadedImages(prev => ({ ...prev, [fileUrl]: true }));
    }
    setNewMessage('');
    setAttachedFile(null);
    setAttachedFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && audioChunksRef.current) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', audioBlob, 'voice-message.webm');
          try {
            const res = await axios.post(`/api/upload`, formData, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const msgData = {
              senderId: user.id,
              receiverId: selectedUser.id,
              text: '',
              fileUrl: res.data.fileUrl
            };
            socket.emit('private_message', msgData);
            setDownloadedImages(prev => ({ ...prev, [res.data.fileUrl]: true }));
            if (!activeChats.find(c => c.id === selectedUser.id)) {
              setActiveChats(prev => [selectedUser, ...prev]);
            }
          } catch (err) {
            alert('Failed to send voice message.');
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or not available.");
    }
  };

  const cancelRecording = () => {
    audioChunksRef.current = null; // Mark as cancelled
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingIntervalRef.current);
    setRecordingDuration(0);
  };

  const sendRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingIntervalRef.current);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPeerConnection = (peerId) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    const pc = new RTCPeerConnection({ 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ] 
    });
    callPeerIdRef.current = peerId;

    pc.onicecandidate = (event) => {
      if (event.candidate && callPeerIdRef.current) {
        socket.emit('ice_candidate', {
          to: callPeerIdRef.current,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteMediaRef.current) {
        if (event.streams && event.streams[0]) {
          if (remoteMediaRef.current.srcObject !== event.streams[0]) {
            remoteMediaRef.current.srcObject = event.streams[0];
          }
        } else {
          if (!remoteMediaRef.current.srcObject) {
            remoteMediaRef.current.srcObject = new MediaStream();
          }
          remoteMediaRef.current.srcObject.addTrack(event.track);
        }
        remoteMediaRef.current.play().catch(e => console.error("Media playback failed", e));
      }
    };
    
    peerConnectionRef.current = pc;
    return pc;
  };

  const endCallLocally = () => {
    setCallState(null);
    setIncomingCallData(null);
    pendingCandidatesRef.current = [];
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (remoteMediaRef.current) {
      remoteMediaRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (mixedAudioContextRef.current) {
      mixedAudioContextRef.current.close();
      mixedAudioContextRef.current = null;
    }
    setIsScreenSharing(false);
    setCallType('audio');
    callPeerIdRef.current = null;
  };

  const initiateCall = async (type = 'audio') => {
    if (!selectedUser) return;
    try {
      setCallType(type);
      const videoConstraints = type === 'video' ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } } : false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints });
      localStreamRef.current = stream;
      setCallState('calling');
      
      if (type === 'video') {
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }, 100);
      }
      
      const pc = getPeerConnection(selectedUser.id);
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) { params.encodings = [{}]; }
          params.encodings[0].maxBitrate = 50000000; // 50 Mbps max bitrate to prevent compression
          params.encodings[0].scaleResolutionDownBy = 1;
          sender.setParameters(params).catch(e => console.error("Error setting video params", e));
        }
      });
      
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(offer);
      
      socket.emit('call_user', {
        userToCall: selectedUser.id,
        signalData: offer,
        from: user.id,
        callerInfo: { firstName: user.firstName, lastName: user.lastName, photographUrl: user.photographUrl, callType: type }
      });
    } catch (err) {
      alert("Microphone access denied or not available for calling.");
    }
  };

  const answerCall = async () => {
    if (!incomingCallData) return;
    try {
      const type = incomingCallData.callerInfo.callType || 'audio';
      setCallType(type);
      const videoConstraints = type === 'video' ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } } : false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints });
      localStreamRef.current = stream;
      setCallState('in_call');
      
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
      }
      
      if (type === 'video') {
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }, 100);
      }
      
      const pc = getPeerConnection(incomingCallData.from);
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) { params.encodings = [{}]; }
          params.encodings[0].maxBitrate = 50000000; // 50 Mbps max bitrate to prevent compression
          params.encodings[0].scaleResolutionDownBy = 1;
          sender.setParameters(params).catch(e => console.error("Error setting video params", e));
        }
      });
      
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.signal));
      
      // Apply buffered candidates
      while(pendingCandidatesRef.current.length > 0) {
        const candidate = pendingCandidatesRef.current.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch(e) { console.error('Error adding buffered ice candidate', e); }
      }

      const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(answer);
      
      socket.emit('answer_call', {
        to: incomingCallData.from,
        signal: answer
      });
    } catch (err) {
      alert("Microphone access denied. Cannot answer call.");
      rejectCall();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!audioTracks[0].enabled);
    }
  };

  const rejectCall = () => {
    if (incomingCallData) {
      socket.emit('reject_call', { to: incomingCallData.from });
    }
    endCallLocally();
  };

  const endCall = () => {
    if (callPeerIdRef.current) {
      socket.emit('end_call', { to: callPeerIdRef.current });
    }
    endCallLocally();
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 }
        }, 
        audio: true 
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      const screenAudioTrack = screenStream.getAudioTracks()[0];
      
      const videoSender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(screenTrack);
      }

      if (screenAudioTrack && localStreamRef.current) {
        // Mix microphone and screen audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        mixedAudioContextRef.current = audioContext;

        const dest = audioContext.createMediaStreamDestination();

        const micTrack = localStreamRef.current.getAudioTracks()[0];
        if (micTrack) {
          const micSource = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
          micSource.connect(dest);
        }

        const screenSource = audioContext.createMediaStreamSource(new MediaStream([screenAudioTrack]));
        screenSource.connect(dest);

        const mixedAudioTrack = dest.stream.getAudioTracks()[0];
        
        const audioSender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(mixedAudioTrack);
        }
      }

      setIsScreenSharing(true);

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error("Failed to share screen", err);
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current && peerConnectionRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const videoSender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender && videoTrack) {
        videoSender.replaceTrack(videoTrack);
      }

      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      const audioSender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (audioSender && audioTrack) {
        audioSender.replaceTrack(audioTrack);
      }
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (mixedAudioContextRef.current) {
      mixedAudioContextRef.current.close();
      mixedAudioContextRef.current = null;
    }
    setIsScreenSharing(false);
  };

  const handleSelectSearchUser = (u) => {
    setSelectedUser(u);
    setIsSearching(false);
    setSearchName('');
    setFilterOffice('');
    setIsContactInfoOpen(false);
  };

  const openSettings = () => {
    setProfileFirstName(user.firstName);
    setProfileLastName(user.lastName);
    setProfileOfficeName(user.officeName);
    setProfilePassword('');
    setProfilePhoto(null);
    setIsSettingsOpen(true);
    setIsSearching(false);
    setIsCallsOpen(false);
  };

  const fetchCallLogs = async () => {
    try {
      const res = await axios.get('/api/call-logs', { headers: { Authorization: `Bearer ${token}` }});
      setCallLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch call logs', err);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('firstName', profileFirstName);
    formData.append('lastName', profileLastName);
    formData.append('officeName', profileOfficeName);
    if (profilePassword) formData.append('password', profilePassword);
    if (profilePhoto) formData.append('photograph', profilePhoto);

    try {
      const res = await axios.put('/api/profile', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setUser(res.data.user);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setIsSettingsOpen(false);
      alert('Profile updated successfully!');
    } catch (err) {
      alert('Failed to update profile.');
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#00a884' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
          <h2 style={{ textAlign: 'center', color: '#075E54' }}>WhatsApp Clone</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} placeholder="Username (ID)" value={username} onChange={e => setUsername(e.target.value)} required />
            <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button style={{ padding: '10px', background: '#075E54', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }} type="submit">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${selectedUser && !isSettingsOpen ? 'hidden' : ''} ${isSidebarMinimized ? 'minimized' : ''}`}>
        <div style={{ background: '#f0f2f5', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              {user.photographUrl ? <img src={`${user.photographUrl}`} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc' }}></div>}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(user.id), border: '2px solid #f0f2f5' }}></div>
            </div>
            <div>
              <strong>{user.firstName} {user.lastName}</strong>
              <select 
                value={userStatuses[user.id]?.customStatus || 'available'} 
                onChange={(e) => socket.emit('set_custom_status', { userId: user.id, customStatus: e.target.value })}
                style={{ display: 'block', marginTop: '2px', fontSize: '11px', padding: '1px 3px', borderRadius: '3px', border: '1px solid #ccc', outline: 'none' }}
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
              </select>
            </div>
          </div>
          <div>
            <button onClick={() => { setIsCallsOpen(true); setIsSettingsOpen(false); setIsSearching(false); fetchCallLogs(); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#00a884', fontWeight: 'bold', marginRight: '10px' }}>📞 Calls</button>
            <button onClick={openSettings} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#00a884', fontWeight: 'bold', marginRight: '10px' }}>⚙️ Profile</button>
            <button onClick={handleLogout} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#555' }}>Logout</button>
          </div>
        </div>
        {isSettingsOpen ? (
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#fff' }}>
            <button onClick={() => setIsSettingsOpen(false)} style={{ marginBottom: '20px', background: 'transparent', border: 'none', color: '#00a884', cursor: 'pointer', fontWeight: 'bold' }}>&larr; Back to Chats</button>
            <h3 style={{ color: '#075E54', marginTop: 0 }}>Profile Settings</h3>
            <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f2f5', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', color: '#666' }}>Your ID (Username)</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#111' }}>{user.username}</div>
            </div>
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div><label style={{ fontSize: '13px', color: '#666' }}>First Name</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={profileFirstName} onChange={e => setProfileFirstName(e.target.value)} required /></div>
              <div><label style={{ fontSize: '13px', color: '#666' }}>Last Name</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={profileLastName} onChange={e => setProfileLastName(e.target.value)} required /></div>
              <div><label style={{ fontSize: '13px', color: '#666' }}>Office Name</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={profileOfficeName} onChange={e => setProfileOfficeName(e.target.value)} required /></div>
              <div><label style={{ fontSize: '13px', color: '#666' }}>New Password</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} type="password" placeholder="Leave blank to keep current" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} /></div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>Update Profile Photo</label>
                <input type="file" accept="image/*" onChange={e => setProfilePhoto(e.target.files[0])} />
              </div>
              <button type="submit" style={{ padding: '10px', background: '#00a884', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
            </form>
          </div>
        ) : isCallsOpen ? (
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#fff' }}>
            <button onClick={() => setIsCallsOpen(false)} style={{ marginBottom: '20px', background: 'transparent', border: 'none', color: '#00a884', cursor: 'pointer', fontWeight: 'bold' }}>&larr; Back to Chats</button>
            <h3 style={{ color: '#075E54', marginTop: 0 }}>Call History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {callLogs.length === 0 ? <p style={{ color: '#666' }}>No recent calls.</p> : callLogs.map(log => {
                const isIncoming = log.receiverId === user.id;
                const otherPerson = isIncoming ? log.caller : log.receiver;
                return (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', paddingBottom: '15px', borderBottom: '1px solid #f0f2f5' }}>
                    {otherPerson.photographUrl ? <img src={`${otherPerson.photographUrl}`} style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#ccc' }}></div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', color: log.status === 'missed' && isIncoming ? '#ff3b30' : '#111' }}>{otherPerson.firstName} {otherPerson.lastName}</div>
                      <div style={{ fontSize: '13px', color: '#667781', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>{isIncoming ? '↙️' : '↗️'}</span>
                        <span>{new Date(log.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px' }}>{log.callType === 'video' ? '📹' : '📞'}</div>
                      <div style={{ fontSize: '12px', color: log.status === 'missed' ? '#ff3b30' : '#667781' }}>{log.status === 'answered' && log.duration ? `${log.duration}s` : log.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : isSearching ? (
          <div style={{ background: '#fff', padding: '15px', borderBottom: '1px solid #e0e0e0' }}>
            <button onClick={() => setIsSearching(false)} style={{ marginBottom: '10px', background: 'transparent', border: 'none', color: '#00a884', cursor: 'pointer', fontWeight: 'bold' }}>&larr; Back to Chats</button>
            <input 
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box', marginBottom: '10px' }} 
              placeholder="Search by name..." 
              value={searchName} 
              onChange={e => setSearchName(e.target.value)} 
            />
            <select 
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} 
              value={filterOffice} 
              onChange={e => setFilterOffice(e.target.value)}
            >
              <option value="">All Offices</option>
              {[...new Set(users.map(u => u.officeName))].map(office => (
                <option key={office} value={office}>{office}</option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ background: '#fff', padding: '10px 15px', borderBottom: '1px solid #e0e0e0' }}>
            <button onClick={() => setIsSearching(true)} style={{ width: '100%', padding: '10px', background: '#00a884', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ New Chat</button>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isSearching ? (
            users.filter(u => {
              const matchesName = (u.firstName + ' ' + u.lastName).toLowerCase().includes(searchName.toLowerCase());
              const matchesOffice = filterOffice ? u.officeName === filterOffice : true;
              return matchesName && matchesOffice;
            }).map(u => (
              <div key={u.id} className="contact-item" onClick={() => handleSelectSearchUser(u)} style={{ padding: '15px', borderBottom: '1px solid #f0f2f5', cursor: 'pointer', background: selectedUser?.id === u.id ? '#f0f2f5' : 'white', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ position: 'relative' }}>
                  {u.photographUrl ? <img src={`${u.photographUrl}`} style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#ccc' }}></div>}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(u.id), border: '2px solid white' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', color: '#111' }}>{u.firstName} {u.lastName}</div>
                  <div style={{ fontSize: '13px', color: '#667781' }}>{u.officeName}</div>
                </div>
              </div>
            ))
          ) : (
            <AnimatePresence>
              {activeChats.map(u => (
                <motion.div 
                  key={u.id} 
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="contact-item" 
                  onClick={() => setSelectedUser(u)} 
                  style={{ padding: '15px', borderBottom: '1px solid #f0f2f5', cursor: 'pointer', background: selectedUser?.id === u.id ? '#f0f2f5' : 'white', display: 'flex', alignItems: 'center', gap: '15px' }}
                >
                  <div style={{ position: 'relative' }}>
                    {u.photographUrl ? <img src={`${u.photographUrl}`} style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#ccc' }}></div>}
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(u.id), border: '2px solid white' }}></div>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', color: '#111' }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize: '13px', color: '#667781' }}>{u.officeName}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedUser ? (
        <div className={`main-chat ${selectedUser ? 'active' : ''}`}>
          {/* Header */}
          <div onClick={() => setIsContactInfoOpen(true)} style={{ background: '#f0f2f5', padding: '15px', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer' }}>
            <button className="mobile-back-btn" onClick={(e) => { e.stopPropagation(); setSelectedUser(null); setIsContactInfoOpen(false); }}>←</button>
            <button className="desktop-toggle-btn" onClick={(e) => { e.stopPropagation(); setIsSidebarMinimized(!isSidebarMinimized); }} title="Toggle Sidebar">
              {isSidebarMinimized ? '→' : '←'}
            </button>
            <div style={{ position: 'relative' }}>
              {selectedUser.photographUrl ? <img src={`${selectedUser.photographUrl}`} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc' }}></div>}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(selectedUser.id), border: '2px solid #f0f2f5' }}></div>
            </div>
            <strong style={{ flex: 1 }}>{selectedUser.firstName} {selectedUser.lastName}</strong>
            <button onClick={(e) => { e.stopPropagation(); initiateCall('video'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', marginRight: '5px' }} title="Video Call">📹</button>
            <button onClick={(e) => { e.stopPropagation(); initiateCall('audio'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px' }} title="Audio Call">📞</button>
          </div>
          
          {/* Messages */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => {
              const isMine = m.senderId === user.id;
              return (
                <div key={i} className="message-bubble" style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '65%', background: isMine ? '#d9fdd3' : 'white', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)', position: 'relative' }}>
                  {m.fileUrl && (
                    <div style={{ marginBottom: '5px' }}>
                      {m.fileUrl.match(/\.(webm|ogg|mp3|wav)$/i) ? (
                        downloadedImages[m.fileUrl] ? (
                          <audio controls src={m.fileUrl} style={{ maxWidth: '100%', height: '40px', outline: 'none' }} />
                        ) : (
                          <div 
                            style={{ width: '250px', padding: '10px', background: '#e0ebeb', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', border: '1px solid #ccc' }}
                            onClick={() => setDownloadedImages(prev => ({ ...prev, [m.fileUrl]: true }))}
                          >
                            <div style={{ fontSize: '24px' }}>⬇️</div>
                            <div>
                              <div style={{ fontSize: '14px', color: '#111', fontWeight: 'bold' }}>Load Audio Message</div>
                              <div style={{ fontSize: '12px', color: '#667781' }}>Tap to load</div>
                            </div>
                          </div>
                        )
                      ) : m.fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? (
                        downloadedImages[m.fileUrl] ? (
                          <img 
                            src={m.fileUrl} 
                            alt="attachment" 
                            style={{ maxWidth: '250px', maxHeight: '250px', borderRadius: '8px', cursor: 'pointer', display: 'block' }} 
                            onClick={() => setFullscreenImage(m.fileUrl)} 
                          />
                        ) : (
                          <div 
                            style={{ width: '250px', height: '150px', background: '#e0ebeb', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid #ccc' }}
                            onClick={() => setDownloadedImages(prev => ({ ...prev, [m.fileUrl]: true }))}
                          >
                            <div style={{ fontSize: '30px', marginBottom: '10px' }}>⬇️</div>
                            <div style={{ fontSize: '14px', color: '#111', fontWeight: 'bold' }}>Download Image</div>
                            <div style={{ fontSize: '12px', color: '#667781' }}>Tap to view</div>
                          </div>
                        )
                      ) : (
                        <a href={`${m.fileUrl}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>Download Attached File</a>
                      )}
                    </div>
                  )}
                  {m.text && <div style={{ fontSize: '14.5px', color: '#111' }}>{m.text}</div>}
                  <div style={{ fontSize: '11px', color: '#667781', textAlign: 'right', marginTop: '4px' }}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* File Preview */}
          {attachedFile && (
            <div style={{ padding: '10px 20px', background: '#e0ebeb', borderTop: '1px solid #ccc', display: 'flex', alignItems: 'center', gap: '15px' }}>
              {attachedFilePreview ? (
                <img src={attachedFilePreview} alt="preview" style={{ height: '60px', borderRadius: '8px' }} />
              ) : (
                <div style={{ fontSize: '30px' }}>📄</div>
              )}
              <div style={{ flex: 1, fontSize: '14px', color: '#111' }}>{attachedFile.name || 'Pasted Image'}</div>
              <button onClick={() => { setAttachedFile(null); setAttachedFilePreview(null); }} style={{ background: 'transparent', border: 'none', color: '#ff3b30', cursor: 'pointer', fontWeight: 'bold' }}>✕ Remove</button>
            </div>
          )}

          {/* Input */}
          <div style={{ background: '#f0f2f5', padding: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isRecording ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 15px', background: '#fff', borderRadius: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ff3b30' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff3b30', animation: 'fadeIn 1s infinite alternate' }}></div>
                  <span style={{ fontWeight: 'bold' }}>{formatDuration(recordingDuration)}</span>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <button onClick={cancelRecording} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '15px' }}>Cancel</button>
                  <button onClick={sendRecording} style={{ background: 'transparent', border: 'none', color: '#00a884', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Send</button>
                </div>
              </div>
            ) : (
              <>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} id="fileUpload" onChange={(e) => {
                  if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    setAttachedFile(file);
                    if (file.type.startsWith('image/')) {
                      setAttachedFilePreview(URL.createObjectURL(file));
                    } else {
                      setAttachedFilePreview(null);
                    }
                    e.target.value = '';
                  }
                }} />
                <label htmlFor="fileUpload" style={{ cursor: 'pointer', padding: '10px', background: '#fff', borderRadius: '50%', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>📎</label>
                <form onSubmit={handleSend} style={{ flex: 1, display: 'flex', gap: '10px' }}>
                  <input style={{ flex: 1, padding: '12px 15px', borderRadius: '8px', border: 'none', outline: 'none' }} placeholder="Type a message or paste an image" value={newMessage} onChange={e => setNewMessage(e.target.value)} />
                  {newMessage.trim() || attachedFile ? (
                    <button className="action-btn" type="submit" style={{ padding: '10px 20px', background: '#00a884', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Send</button>
                  ) : (
                    <button type="button" onClick={startRecording} className="action-btn" style={{ padding: '10px', background: '#00a884', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', width: '42px', height: '42px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>🎤</button>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={`main-chat ${selectedUser ? 'active' : ''}`} style={{ justifyContent: 'center', alignItems: 'center', background: '#f0f2f5', backgroundImage: 'none', position: 'relative' }}>
          <button className="desktop-toggle-btn" onClick={() => setIsSidebarMinimized(!isSidebarMinimized)} style={{ position: 'absolute', top: '15px', left: '15px' }} title="Toggle Sidebar">
            {isSidebarMinimized ? '→' : '←'}
          </button>
          <h1 style={{ color: '#667781', fontWeight: '300' }}>Select a chat to start messaging</h1>
        </div>
      )}

      {/* Contact Info Sidebar */}
      {selectedUser && isContactInfoOpen && (
        <div className="contact-info-sidebar">
          <div style={{ background: '#f0f2f5', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={() => setIsContactInfoOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#54656f' }}>✕</button>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#111' }}>Contact Info</h2>
          </div>
          <div style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff', borderBottom: '10px solid #f0f2f5' }}>
            <div style={{ position: 'relative' }}>
              {selectedUser.photographUrl ? (
                <img src={`${selectedUser.photographUrl}`} style={{ width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover', marginBottom: '20px' }} alt="profile" />
              ) : (
                <div style={{ width: '200px', height: '200px', borderRadius: '50%', background: '#ccc', marginBottom: '20px' }}></div>
              )}
              <div style={{ position: 'absolute', bottom: '25px', right: '15px', width: '30px', height: '30px', borderRadius: '50%', background: getStatusColor(selectedUser.id), border: '4px solid white' }}></div>
            </div>
            <h2 style={{ margin: 0, color: '#111', fontSize: '24px' }}>{selectedUser.firstName} {selectedUser.lastName}</h2>
          </div>
          <div style={{ padding: '20px', background: '#fff', flex: 1 }}>
            <div style={{ color: '#8696a0', fontSize: '14px', marginBottom: '5px' }}>Office</div>
            <div style={{ color: '#111', fontSize: '16px' }}>{selectedUser.officeName}</div>
          </div>
        </div>
      )}

      {/* WebRTC Media Output (Plays both audio and video) */}
      <video 
        ref={remoteMediaRef} 
        style={callState === 'in_call' && callType === 'video' ? (
          isScreenSharing ? {
            display: 'block', position: 'fixed', bottom: '120px', left: '20px', width: '200px', height: '150px', objectFit: 'cover', borderRadius: '12px', zIndex: 998, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backgroundColor: '#333'
          } : { 
            display: 'block', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'cover', zIndex: 998 
          }
        ) : { 
          width: '1px', height: '1px', opacity: 0, position: 'absolute', pointerEvents: 'none' 
        }} 
        autoPlay 
        playsInline 
      />
      
      {/* Ringtone Output */}
      <audio ref={ringtoneRef} src="/ringtone.wav" loop style={{ display: 'none' }} />
      
      {/* Local Video Picture-in-Picture */}
      <video 
        ref={localVideoRef} 
        style={callState === 'in_call' && callType === 'video' ? { 
          display: 'block', position: 'fixed', bottom: '120px', right: '20px', width: '120px', height: '160px', objectFit: 'cover', borderRadius: '12px', zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backgroundColor: '#333', transform: 'scaleX(-1)' 
        } : { 
          display: 'none' 
        }} 
        autoPlay 
        playsInline 
        muted 
      />

      {/* Call Overlays */}
      {callState && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: callType === 'video' && callState === 'in_call' ? 'transparent' : 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: callType === 'video' && callState === 'in_call' ? 'flex-end' : 'center', paddingBottom: callType === 'video' && callState === 'in_call' ? '40px' : '0', color: 'white', pointerEvents: callType === 'video' && callState === 'in_call' ? 'none' : 'auto' }}>
          {callState === 'calling' && (
            <>
              <div style={{ fontSize: '24px', marginBottom: '20px' }}>Calling {selectedUser?.firstName}... {callType === 'video' && '📹'}</div>
              <button onClick={endCall} style={{ padding: '15px 30px', background: '#ff3b30', color: 'white', border: 'none', borderRadius: '30px', fontSize: '18px', cursor: 'pointer', pointerEvents: 'auto' }}>End Call</button>
            </>
          )}
          {callState === 'receiving' && incomingCallData && (
            <>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>Incoming {incomingCallData.callerInfo.callType === 'video' ? 'Video' : 'Audio'} Call</div>
              <div style={{ fontSize: '20px', marginBottom: '30px', color: '#00a884' }}>{incomingCallData.callerInfo.firstName} {incomingCallData.callerInfo.lastName}</div>
              <div style={{ display: 'flex', gap: '20px', pointerEvents: 'auto' }}>
                <button onClick={rejectCall} style={{ padding: '15px 30px', background: '#ff3b30', color: 'white', border: 'none', borderRadius: '30px', fontSize: '18px', cursor: 'pointer' }}>Reject</button>
                <button onClick={answerCall} style={{ padding: '15px 30px', background: '#00a884', color: 'white', border: 'none', borderRadius: '30px', fontSize: '18px', cursor: 'pointer', animation: 'fadeIn 1s infinite alternate' }}>Accept</button>
              </div>
            </>
          )}
          {callState === 'in_call' && (
            <>
              {callType === 'audio' && (
                <>
                  <div style={{ fontSize: '24px', marginBottom: '20px', color: '#00a884' }}>In Call</div>
                  <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', marginBottom: '30px' }}>📞</div>
                </>
              )}
              <div style={{ display: 'flex', gap: '20px', pointerEvents: 'auto' }}>
                {callType === 'video' && (
                  <button onClick={isScreenSharing ? stopScreenShare : shareScreen} style={{ padding: '15px', background: isScreenSharing ? '#00a884' : '#333', color: 'white', border: 'none', borderRadius: '50%', fontSize: '20px', cursor: 'pointer', width: '60px', height: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} title={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
                    🖥️
                  </button>
                )}
                <button onClick={toggleMute} style={{ padding: '15px', background: isMuted ? '#ff3b30' : '#333', color: 'white', border: 'none', borderRadius: '50%', fontSize: '20px', cursor: 'pointer', width: '60px', height: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} title="Toggle Mute">
                  {isMuted ? '🔇' : '🎤'}
                </button>
                <button onClick={endCall} style={{ padding: '15px 30px', background: '#ff3b30', color: 'white', border: 'none', borderRadius: '30px', fontSize: '18px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>End Call</button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Fullscreen Image Viewer */}
      {fullscreenImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.95)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setFullscreenImage(null)}>
          <button style={{ position: 'absolute', top: '20px', right: '30px', background: 'transparent', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer' }} onClick={() => setFullscreenImage(null)}>✕</button>
          <img src={fullscreenImage} alt="fullscreen preview" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export default App;
