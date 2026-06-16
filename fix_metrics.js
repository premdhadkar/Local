const fs = require('fs');
const path = require('path');

function getDirSize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      size += stats.size;
    } else if (stats.isDirectory()) {
      size += getDirSize(filePath);
    }
  }
  return size;
}

try {
  let totalSize = 0;
  if (fs.existsSync(path.join(__dirname, 'backend/prisma/dev.db'))) {
    totalSize += fs.statSync(path.join(__dirname, 'backend/prisma/dev.db')).size;
  }
  if (fs.existsSync(path.join(__dirname, 'backend/uploads'))) {
    totalSize += getDirSize(path.join(__dirname, 'backend/uploads'));
  }
  console.log("Total size:", totalSize);
} catch (e) {
  console.error(e);
}
