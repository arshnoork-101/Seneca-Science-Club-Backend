// File storage configuration - no database needed
console.log('✅ File storage system initialized');

// Test file system access
async function testConnection() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const testDir = path.join(__dirname, '../data');
    
    // Ensure data directory exists
    try {
      await fs.access(testDir);
    } catch {
      await fs.mkdir(testDir, { recursive: true });
    }
    
    console.log('✅ File storage system ready');
  } catch (error) {
    console.error('❌ File storage system failed:', error);
    process.exit(1);
  }
}

module.exports = { testConnection };
