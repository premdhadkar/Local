import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import api from '../../utils/api';
import TeamsSidebar from './TeamsSidebar';
import CallOverlay from '../webrtc/CallOverlay';

export default function AppContainer() {
  const { user, updateProfile } = useAuth();
  const { socket, userStatuses, myStatus } = useSocket();
  const { initiateCall, isCallMinimized } = useWebRTC();

  const [users, setUsers] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [filterOffice, setFilterOffice] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCallsOpen, setIsCallsOpen] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  
  const [profileFirstName, setProfileFirstName] = useState(user.firstName || '');
  const [profileLastName, setProfileLastName] = useState(user.lastName || '');
  const [profileOfficeName, setProfileOfficeName] = useState(user.officeName || '');
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

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    if (socket) {
      socket.on('messages', setMessages);
      socket.on('new_message', (msg) => {
        setMessages(prev => [...prev, msg]);
      });
      socket.on('message_deleted', (msgId) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      });
      return () => {
        socket.off('messages');
        socket.off('new_message');
        socket.off('message_deleted');
      };
    }
  }, [socket]);

  useEffect(() => {
    if (selectedUser && socket) {
      socket.emit('fetch_messages', selectedUser.id);
    }
  }, [selectedUser, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchUsers = async () => {
    const res = await api.get('/users');
    setUsers(res.data.filter(u => u.id !== user.id));
  };

  const fetchCallLogs = async () => {
    const res = await api.get('/call-logs');
    setCallLogs(res.data);
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !attachedFile) || !selectedUser) return;

    let fileUrl = null;
    if (attachedFile) {
      const formData = new FormData();
      formData.append('file', attachedFile);
      const res = await api.post('http://localhost:3000/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fileUrl = res.data.fileUrl;
    }

    socket.emit('send_message', { receiverId: selectedUser.id, text: newMessage, fileUrl });
    setNewMessage('');
    setAttachedFile(null);
    setAttachedFilePreview(null);
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteMessage = (messageId, timestamp) => {
    const timeDiff = new Date() - new Date(timestamp);
    if (timeDiff > 5 * 60 * 1000) return alert('Can only delete messages within 5 minutes.');
    if (window.confirm("Delete this message for everyone?")) {
      socket.emit('delete_message', { messageId, userId: user.id });
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('firstName', profileFirstName);
    formData.append('lastName', profileLastName);
    formData.append('officeName', profileOfficeName);
    if (profilePassword) formData.append('password', profilePassword);
    if (profilePhoto) formData.append('photograph', profilePhoto);

    try {
      await updateProfile(formData);
      alert('Profile updated');
    } catch (err) {
      alert('Failed to update profile');
    }
  };

  const getStatusColor = (status) => {
    if (status === 'available') return '#25D366';
    if (status === 'busy') return '#FF9800';
    if (status === 'oncall') return '#FF3B30';
    return '#ccc';
  };

  const StatusDot = ({ status, style }) => (
    <div style={{
      width: '12px', height: '12px', borderRadius: '50%', 
      backgroundColor: getStatusColor(status),
      border: '2px solid white', ...style
    }} title={status || 'offline'} />
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        setAttachedFile(file);
        setAttachedFilePreview(URL.createObjectURL(file));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const handlePaste = (e) => {
    if (!selectedUser) return;
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') === 0 || item.type.indexOf('video') === 0) {
        const file = item.getAsFile();
        setAttachedFile(file);
        setAttachedFilePreview(URL.createObjectURL(file));
      }
    }
  };

  const renderMessageContent = (msg) => {
    const isSender = msg.senderId === user.id;
    return (
      <div style={{ 
        maxWidth: '70%', padding: '10px 15px', borderRadius: '8px', 
        background: isSender ? '#dcf8c6' : 'white', 
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)', position: 'relative'
      }}>
        {msg.fileUrl && (
          <div style={{ marginBottom: '10px' }}>
            {msg.fileUrl.match(/\.(jpeg|jpg|gif|png)$/i) ? (
              <img src={`http://localhost:3000${msg.fileUrl}`} style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setFullscreenImage(`http://localhost:3000${msg.fileUrl}`)} />
            ) : msg.fileUrl.match(/\.(webm|mp4|ogg)$/i) ? (
              <video src={`http://localhost:3000${msg.fileUrl}`} controls style={{ maxWidth: '100%', borderRadius: '4px' }} />
            ) : (
              <a href={`http://localhost:3000${msg.fileUrl}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc', textDecoration: 'none' }}>📎 Download File</a>
            )}
          </div>
        )}
        <div style={{ wordBreak: 'break-word', color: '#333' }}>{msg.text}</div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '5px', textAlign: 'right' }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isSender && (new Date() - new Date(msg.timestamp) <= 5 * 60 * 1000) && (
            <span onClick={() => deleteMessage(msg.id, msg.timestamp)} style={{ marginLeft: '10px', cursor: 'pointer', color: '#ff3b30' }}>🗑️</span>
          )}
        </div>
      </div>
    );
  };

  const filteredUsers = users.filter(u => {
    const matchName = `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchName.toLowerCase());
    const matchOffice = filterOffice ? u.officeName === filterOffice : true;
    return matchName && matchOffice;
  });

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', background: '#f0f2f5' }} onPaste={handlePaste}>
      
      <TeamsSidebar 
        isCallsOpen={isCallsOpen} setIsCallsOpen={setIsCallsOpen}
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        setIsSearching={setIsSearching} fetchCallLogs={fetchCallLogs}
      />

      {/* Main List Area (Contacts, Calls, Settings) */}
      <div style={{ width: '350px', background: 'white', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        {isSettingsOpen ? (
          <div style={{ padding: '20px' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#002244' }}>Settings</h2>
            <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ textAlign: 'center' }}>
                {user.photographUrl ? <img src={`${user.photographUrl}`} style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#eee', margin: '0 auto' }}></div>}
                <input type="file" onChange={e => setProfilePhoto(e.target.files[0])} style={{ marginTop: '10px', fontSize: '12px' }} />
              </div>
              <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={profileFirstName} onChange={e => setProfileFirstName(e.target.value)} placeholder="First Name" />
              <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={profileLastName} onChange={e => setProfileLastName(e.target.value)} placeholder="Last Name" />
              <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={profileOfficeName} onChange={e => setProfileOfficeName(e.target.value)} placeholder="Office Name" />
              <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} type="password" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} placeholder="New Password (optional)" />
              <button type="submit" style={{ padding: '10px', background: '#002244', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
            </form>
          </div>
        ) : isCallsOpen ? (
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#002244' }}>Call History</h2>
            {callLogs.map(log => {
              const isCaller = log.callerId === user.id;
              const otherUser = isCaller ? log.receiver : log.caller;
              return (
                <div key={log.id} style={{ display: 'flex', alignItems: 'center', padding: '10px', borderBottom: '1px solid #f0f0f0' }}>
                  {otherUser.photographUrl ? <img src={`${otherUser.photographUrl}`} style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '15px' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc', marginRight: '15px' }}></div>}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>{otherUser.firstName} {otherUser.lastName}</div>
                    <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {isCaller ? '↗️ Outgoing' : '↙️ Incoming'} • {new Date(log.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '20px' }}>{log.callType === 'video' ? '📹' : '📞'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '20px', background: '#f8f9fa', borderBottom: '1px solid #ddd' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => setIsSearching(false)} style={{ flex: 1, padding: '8px', background: !isSearching ? '#002244' : '#fff', color: !isSearching ? 'white' : '#333', border: '1px solid #002244', borderRadius: '20px', cursor: 'pointer' }}>Chats</button>
                <button onClick={() => setIsSearching(true)} style={{ flex: 1, padding: '8px', background: isSearching ? '#002244' : '#fff', color: isSearching ? 'white' : '#333', border: '1px solid #002244', borderRadius: '20px', cursor: 'pointer' }}>Directory</button>
              </div>
              {isSearching && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input style={{ padding: '8px 15px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }} placeholder="Search name..." value={searchName} onChange={e => setSearchName(e.target.value)} />
                  <input style={{ padding: '8px 15px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }} placeholder="Filter by office..." value={filterOffice} onChange={e => setFilterOffice(e.target.value)} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(isSearching ? filteredUsers : users).map(u => (
                <div key={u.id} onClick={() => { setSelectedUser(u); setIsContactInfoOpen(false); }} style={{ display: 'flex', alignItems: 'center', padding: '15px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: selectedUser?.id === u.id ? '#e9ecef' : 'white', transition: 'background 0.2s' }}>
                  <div style={{ position: 'relative' }}>
                    {u.photographUrl ? <img src={`${u.photographUrl}`} style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#ccc' }}></div>}
                    <StatusDot status={userStatuses[u.id]} style={{ position: 'absolute', bottom: 2, right: 2 }} />
                  </div>
                  <div style={{ marginLeft: '15px', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#002244' }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize: '13px', color: '#666' }}>{u.officeName}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      {selectedUser ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ padding: '15px 20px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsContactInfoOpen(!isContactInfoOpen)}>
              {selectedUser.photographUrl ? <img src={`${selectedUser.photographUrl}`} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc', marginRight: '15px' }}></div>}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{selectedUser.firstName} {selectedUser.lastName}</div>
                <div style={{ fontSize: '13px', color: '#666', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <StatusDot status={userStatuses[selectedUser.id]} />
                  {userStatuses[selectedUser.id] || 'offline'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => initiateCall(selectedUser, 'audio')} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#002244' }} title="Audio Call">📞</button>
              <button onClick={() => initiateCall(selectedUser, 'video')} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#002244' }} title="Video Call">📹</button>
            </div>
          </div>

          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', background: '#efeae2', backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.senderId === user.id ? 'flex-end' : 'flex-start' }}>
                {renderMessageContent(msg)}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment Preview */}
          {attachedFilePreview && (
            <div style={{ padding: '10px', background: '#f0f0f0', borderTop: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {attachedFile?.type?.startsWith('image/') ? (
                <img src={attachedFilePreview} style={{ height: '60px', borderRadius: '4px' }} />
              ) : attachedFile?.type?.startsWith('video/') || attachedFile?.type?.startsWith('audio/') ? (
                <video src={attachedFilePreview} style={{ height: '60px', borderRadius: '4px' }} />
              ) : (
                <div style={{ padding: '10px', background: 'white', borderRadius: '4px', fontSize: '12px' }}>{attachedFile?.name}</div>
              )}
              <button onClick={() => { setAttachedFile(null); setAttachedFilePreview(null); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'red', fontWeight: 'bold' }}>X</button>
            </div>
          )}

          <div style={{ padding: '15px 20px', background: '#f0f2f5', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => fileInputRef.current.click()} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}>📎</button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => {
              if (e.target.files[0]) {
                setAttachedFile(e.target.files[0]);
                setAttachedFilePreview(URL.createObjectURL(e.target.files[0]));
              }
            }} />
            <form onSubmit={sendMessage} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input style={{ flex: 1, padding: '12px 15px', borderRadius: '24px', border: 'none', outline: 'none', fontSize: '15px' }} placeholder="Type a message" value={newMessage} onChange={e => setNewMessage(e.target.value)} />
              {newMessage.trim() || attachedFile ? (
                <button type="submit" style={{ background: '#002244', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>➤</button>
              ) : isRecording ? (
                <button type="button" onClick={stopRecording} style={{ background: '#ff3b30', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>⏹</button>
              ) : (
                <button type="button" onClick={startRecording} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '24px' }}>🎤</button>
              )}
            </form>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8f9fa', color: '#666' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.2 }}>NIC</div>
          <h2>Gov-Comm Web</h2>
          <p>Select a contact to start messaging securely.</p>
        </div>
      )}

      {/* WebRTC Overlay */}
      <CallOverlay />

      {/* Fullscreen Image Preview */}
      {fullscreenImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
          <button style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  );
}
