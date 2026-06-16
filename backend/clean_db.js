const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function cleanDatabaseAndUploads() {
  console.log("⚠️ Starting Database and Media Cleanup...");

  try {
    // 1. Delete all Call Logs
    console.log("🗑️ Deleting Call Logs...");
    const callLogsResult = await prisma.callLog.deleteMany({});
    console.log(`✅ Deleted ${callLogsResult.count} call logs.`);

    // 2. Delete all Messages
    console.log("🗑️ Deleting Messages...");
    const messagesResult = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${messagesResult.count} messages.`);

    // 3. Delete all Users EXCEPT the default 'admin'
    console.log("🗑️ Deleting Users (excluding admin)...");
    const usersResult = await prisma.user.deleteMany({
      where: {
        username: {
          not: 'admin' // Keep the admin so you don't get locked out of the portal
        }
      }
    });
    console.log(`✅ Deleted ${usersResult.count} users.`);

    // 4. Delete Uploaded Media Files
    console.log("🗑️ Deleting Uploaded Media Files...");
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      let deletedFilesCount = 0;
      
      for (const file of files) {
        if (file !== '.gitkeep') { // Don't delete .gitkeep if it exists
          fs.unlinkSync(path.join(uploadsDir, file));
          deletedFilesCount++;
        }
      }
      console.log(`✅ Deleted ${deletedFilesCount} media files from /uploads.`);
    } else {
      console.log("ℹ️ Uploads directory does not exist, skipping media deletion.");
    }

    console.log("\n🎉 Cleanup completed successfully!");

  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the cleanup script
cleanDatabaseAndUploads();
