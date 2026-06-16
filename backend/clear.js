const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function clearData() {
  try {
    // Delete all messages
    await prisma.message.deleteMany();
    
    // Delete all non-admin users
    await prisma.user.deleteMany({
      where: { role: 'USER' }
    });
    
    console.log('Successfully cleared all messages and users from the database.');

    // Clear uploads folder
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
      console.log('Successfully cleared all uploaded files.');
    }
  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearData();
