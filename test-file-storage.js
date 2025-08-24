// Test file storage system
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BLOG_DATA_FILE = path.join(__dirname, 'data/blog-posts.json');
const DATA_DIR = path.join(__dirname, 'data');

async function testFileStorage() {
  try {
    console.log('Testing file storage system...');
    
    // Ensure data directory exists
    try {
      await fs.access(DATA_DIR);
      console.log('✅ Data directory exists');
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
      console.log('✅ Data directory created');
    }
    
    // Test writing a sample blog post
    const testPost = {
      id: uuidv4(),
      title: 'Test Blog Post',
      content: 'This is a test blog post to verify file storage works.',
      excerpt: 'Test excerpt for the blog post.',
      tags: ['test', 'file-storage'],
      imageUrl: 'https://example.com/image.jpg',
      author: {
        firstName: 'Test',
        lastName: 'Author',
        program: 'Science Club'
      },
      isPublished: true,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Write test data
    await fs.writeFile(BLOG_DATA_FILE, JSON.stringify([testPost], null, 2));
    console.log('✅ Test blog post written to file');
    
    // Read test data
    const data = await fs.readFile(BLOG_DATA_FILE, 'utf8');
    const posts = JSON.parse(data);
    console.log('✅ Test blog post read from file:', posts[0].title);
    
    console.log('🎉 File storage system is working correctly!');
    
  } catch (error) {
    console.error('❌ File storage test failed:', error);
  }
}

testFileStorage();
