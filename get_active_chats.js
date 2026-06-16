const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const userId = 1;
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    select: { senderId: true, receiverId: true }
  });
  
  const userIds = new Set();
  for (const m of messages) {
    if (m.senderId !== userId) userIds.add(m.senderId);
    if (m.receiverId !== userId) userIds.add(m.receiverId);
  }
  
  console.log(Array.from(userIds));
}
test();
