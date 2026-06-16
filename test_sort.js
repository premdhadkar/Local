const reqUserId = 1;

const messages = [
  { senderId: 1, receiverId: 2, text: "most recent", timestamp: 3 },
  { senderId: 3, receiverId: 1, text: "older", timestamp: 2 },
  { senderId: 1, receiverId: 2, text: "oldest", timestamp: 1 },
];

messages.sort((a,b) => b.timestamp - a.timestamp); // orderBy: desc

const chatUserIds = new Set();
messages.forEach(m => {
  if (m.senderId !== reqUserId) chatUserIds.add(m.senderId);
  if (m.receiverId !== reqUserId) chatUserIds.add(m.receiverId);
});

console.log("Ordered IDs:", Array.from(chatUserIds)); // Should be [2, 3]

const chatUsers = [
  { id: 2, name: "User 2" },
  { id: 3, name: "User 3" },
];

const orderedIds = Array.from(chatUserIds);
chatUsers.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));

console.log("Sorted users:", chatUsers);
