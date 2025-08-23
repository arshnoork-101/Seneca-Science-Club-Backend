# Seneca Science Club - Backend API

A Node.js/Express backend API for the Seneca Science Club website, providing authentication, event management, blog functionality, and contact form handling.

## 🚀 Features

- **User Authentication** - JWT-based auth system
- **Event Management** - CRUD operations for events
- **Blog System** - Article management with categories
- **Contact Forms** - Email handling and form submissions
- **File Uploads** - Image upload with Cloudinary integration
- **Database** - PostgreSQL with Prisma ORM

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type-safe development
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **JWT** - Authentication
- **Cloudinary** - Image hosting
- **Nodemailer** - Email service

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SSC-Official/server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create `.env` file:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/ssc_db"
   
   # JWT
   JWT_SECRET="your-super-secret-jwt-key"
   JWT_EXPIRES_IN="7d"
   
   # Cloudinary
   CLOUDINARY_CLOUD_NAME="your-cloud-name"
   CLOUDINARY_API_KEY="your-api-key"
   CLOUDINARY_API_SECRET="your-api-secret"
   
   # Email
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-app-password"
   
   # Server
   PORT=3000
   NODE_ENV="development"
   ```

4. **Database Setup**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 🏗️ Project Structure

```
src/
├── config/
│   ├── database.js         # Database configuration
│   └── cloudinary.js       # Cloudinary setup
├── middleware/
│   ├── auth.js             # JWT authentication
│   ├── upload.js           # File upload handling
│   └── validation.js       # Request validation
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── events.js           # Event management
│   ├── blog.js             # Blog/articles
│   ├── contact.js          # Contact forms
│   ├── team.js             # Team management
│   └── upload.js           # File uploads
├── prisma/
│   └── schema.prisma       # Database schema
└── server.js               # Main server file
```

## 🗄️ Database Schema

### Users
```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  role      Role     @default(MEMBER)
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Events
```prisma
model Event {
  id          Int      @id @default(autoincrement())
  title       String
  description String
  date        DateTime
  location    String
  image       String?
  capacity    Int?
  registrations Registration[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Articles
```prisma
model Article {
  id        Int      @id @default(autoincrement())
  title     String
  content   String
  excerpt   String?
  image     String?
  author    String
  tags      String[]
  published Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 🛣️ API Routes

### Authentication
```
POST   /api/auth/register     # User registration
POST   /api/auth/login        # User login
POST   /api/auth/refresh      # Refresh token
GET    /api/auth/profile      # Get user profile
PUT    /api/auth/profile      # Update profile
```

### Events
```
GET    /api/events            # Get all events
GET    /api/events/:id        # Get event by ID
POST   /api/events            # Create event (admin)
PUT    /api/events/:id        # Update event (admin)
DELETE /api/events/:id        # Delete event (admin)
POST   /api/events/:id/register # Register for event
```

### Blog/Articles
```
GET    /api/blog              # Get all articles
GET    /api/blog/:id          # Get article by ID
POST   /api/blog              # Create article (admin)
PUT    /api/blog/:id          # Update article (admin)
DELETE /api/blog/:id          # Delete article (admin)
GET    /api/blog/tags         # Get all tags
```

### Contact
```
POST   /api/contact           # Send contact form
GET    /api/contact           # Get all messages (admin)
PUT    /api/contact/:id       # Mark as read (admin)
```

### File Upload
```
POST   /api/upload/image      # Upload image to Cloudinary
POST   /api/upload/multiple   # Upload multiple images
```

## 🔐 Authentication

### JWT Token Structure
```json
{
  "userId": 123,
  "email": "user@example.com",
  "role": "MEMBER",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Protected Routes
- Use `auth` middleware for protected endpoints
- Admin routes require `ADMIN` or `MODERATOR` role
- Member routes require valid JWT token

## 📧 Email Configuration

### Gmail Setup
1. Enable 2-factor authentication
2. Generate app-specific password
3. Use app password in SMTP_PASS

### Email Templates
- **Welcome Email** - New user registration
- **Event Confirmation** - Event registration
- **Contact Form** - Form submissions
- **Password Reset** - Password recovery

## 🖼️ File Upload

### Cloudinary Integration
```javascript
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
```

### Upload Middleware
- **File validation** - Type and size limits
- **Image optimization** - Automatic compression
- **Secure URLs** - Signed URLs for sensitive content

## 🔧 Development

### Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database
```

### Environment Variables
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
CLOUDINARY_CLOUD_NAME=your-cloud
SMTP_HOST=smtp.gmail.com
```

## 🚀 Deployment

### Production Setup
1. **Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Environment Variables**
   Set all required env vars in production

3. **Start Server**
   ```bash
   npm run start
   ```

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Monitoring

### Health Check
```
GET /api/health
```

### Logging
- **Winston** for structured logging
- **Morgan** for HTTP request logging
- **Error tracking** with stack traces

## 🧪 Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### API Testing
Use Postman collection in `/docs/postman/`

## 🔒 Security

- **Helmet** - Security headers
- **CORS** - Cross-origin protection
- **Rate Limiting** - API rate limits
- **Input Validation** - Joi validation
- **SQL Injection** - Prisma protection
- **XSS Protection** - Input sanitization

## 📈 Performance

- **Caching** - Redis for session storage
- **Database Indexing** - Optimized queries
- **Compression** - Gzip middleware
- **Connection Pooling** - Database connections

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/api-endpoint`
3. Commit changes: `git commit -am 'Add new endpoint'`
4. Push to branch: `git push origin feature/api-endpoint`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For API support, contact:
- Email: senecascienceclub@gmail.com
- Documentation: `/docs/api`

---

**Built with ❤️ by the Seneca Science Club Team**
