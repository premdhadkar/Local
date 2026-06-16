const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const messages = await prisma.message.findMany();
  console.log(messages);
  const users = await prisma.user.findMany();
  console.log(users.map(u => ({id: u.id, username: u.username})));
}
run();
