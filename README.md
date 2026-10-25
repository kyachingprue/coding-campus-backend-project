# Code Campus API

Express and MongoDB API for Code Campus. Authentication uses an HTTP-only JWT cookie (a bearer token is also accepted for API clients). New public registrations are always `student`; only an admin can promote instructors or admins.

## Setup

1. Use Node.js 20 or newer.
2. Add the required environment values to `.env` in this folder. Never paste keys into source files or commit `.env`.
3. Create a MongoDB database/user and set `MONGODB_URI`.
4. Install and start:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

The backend source is TypeScript. Run `npm run build` to compile it into
`dist/`, or `npm test` to compile and run the backend tests.

5. Create the first administrator (use a strong password):

   ```powershell
   npm run seed:admin
   ```

6. To make the frontend's sample course catalog purchasable, run:

   ```powershell
   npm run seed:courses
   ```

   The seed command creates missing courses only; edit course prices and details in the database or through instructor/admin course endpoints.

7. In `frontend/.env`, set `VITE_API_URL=http://localhost:5000/api`. Restart Vite after changing environment values.

## Environment keys

- `MONGODB_URI`: MongoDB Atlas/local database connection string.
- `JWT_SECRET`: random secret with at least 32 characters.
- `CLIENT_URL`: exact frontend origin; used for CORS and Stripe redirects.
- `STRIPE_SECRET_KEY`: Stripe API secret (`sk_test_...` while testing).
- `STRIPE_WEBHOOK_SECRET`: signing secret for the Stripe webhook endpoint.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: SMTP delivery for password-reset email. A Gmail account needs an App Password, not the account password.
- `IMGBB_API_KEY`: ImgBB API key for avatar/cover uploads.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary credentials for course cover images only.
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: only needed by `npm run seed:admin`.

Do not commit real secrets. URL-encode special characters in the MongoDB username/password within `MONGODB_URI`. For production, use your host's secret manager and HTTPS, use Stripe live keys only after deploying a verified webhook, and set `NODE_ENV=production` and `CLIENT_URL` to the production frontend domain.

For a Vercel backend deployment, set `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `CLIENT_URL` in the backend project's Production environment. Allow the deployed backend to connect to MongoDB in Atlas Network Access. The API connects before handling requests and reuses its connection in warm serverless instances.

## Google Drive video links

Upload videos to Google Drive yourself, then set General access to **Anyone with the link** as a viewer. In the instructor course builder, paste the video's sharing URL into its lesson and save the draft. The backend validates and stores the submitted URL alongside its Drive file ID. For playback, it issues a time-limited lesson URL and streams byte-range requests from Drive through the backend, avoiding browser restrictions on direct Drive media links. It does not upload video files or call the Google Drive API, so no Google OAuth credentials or Drive API setup are required. Public-link access means the source video can be viewed outside the website by anyone who has its link.

## Stripe test payments

The server creates Checkout Sessions with course prices read from MongoDB. It never trusts a price supplied by the browser. The learner is enrolled only after a signed Stripe webhook or the authenticated checkout-return verification confirms that Stripe reports the session as paid.

New account registrations send a 6-digit email verification code through the configured SMTP account. Codes expire after 10 minutes; the account is created and signed in only after the code is verified. Registration passwords must be 8–128 characters and include an uppercase letter, a lowercase letter, and a number.

For local webhook testing, install the Stripe CLI, sign in, then run:

```powershell
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Copy the displayed `whsec_...` value to `STRIPE_WEBHOOK_SECRET`. In production, add `https://YOUR_API_DOMAIN/api/payments/webhook` in Stripe Dashboard and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`.

## Routes

All API routes are under `/api`. Errors return `{ "error": "..." }`.

Dashboard routes are role-specific: students use `/dashboard`, instructors use `/instructor/dashboard`, and admins use `/admin/dashboard`. A signed-in user sent to a dashboard for another role is redirected to their own dashboard. The instructor workspace includes course management, course lesson uploads, payment reports, and analytics; admin routes provide user-role management, course catalog controls, payment records, and platform analytics.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| POST | `/auth/register` | Public | Register a student |
| POST | `/auth/login` | Public | Sign in |
| POST | `/auth/logout` | Public | Clear auth cookie |
| GET | `/auth/me` | Signed in | Current user |
| PATCH | `/auth/me` | Signed in | Update profile details |
| PATCH | `/auth/password` | Signed in | Change password |
| POST | `/auth/forgot-password` | Public, rate limited | Send reset email |
| POST | `/auth/reset-password` | Public, rate limited | Reset password |
| GET | `/courses` | Public | List published courses |
| GET | `/courses/:courseId` | Public | Course detail |
| GET | `/courses/:courseId/content` | Enrolled student, owning instructor, or admin | Protected course video/content |
| POST/PATCH/DELETE | `/courses` or `/courses/:id` | Instructor/admin | Manage courses (instructors manage only their own) |
| GET | `/courses/instructor/mine` | Instructor/admin | Instructor's courses |
| GET | `/courses/admin/all` | Admin | All courses, including unpublished courses |
| PATCH | `/courses/:id/lessons/video-link` | Instructor/admin | Save or clear a lesson's Google Drive sharing link (`lessonId`, `videoUrl`; blank URL clears the link) |
| GET | `/courses/:courseId/lessons/:lessonId/video-stream` | Signed playback URL | Stream a Drive lesson video with byte-range support |
| POST | `/courses/:id/image` | Instructor/admin | Upload a course cover image (`image` multipart field; 5 MB maximum) |
| GET | `/enrollments/mine` | Signed in | Current learner's enrollments |
| POST | `/payments/checkout-session` | Signed in | Create Stripe Checkout Session (`{ "courseId": "js" }`) |
| GET | `/payments/session/:sessionId` | Signed in, owner only | Verify Checkout return and fulfill paid enrollment |
| GET | `/payments/mine` | Signed in | Payment history |
| GET | `/payments/instructor` | Instructor/admin | Payments for owned courses, revenue summary, monthly metrics, and top courses |
| POST | `/payments/webhook` | Stripe signature | Stripe payment events |
| POST | `/uploads/profile-image` | Signed in | Upload ImgBB image; multipart fields `image` and optional `type=cover` |
| GET | `/admin/users` | Admin | List users |
| GET | `/admin/students` | Admin | Students, enrolled courses, paid order count, and total spend |
| GET | `/admin/instructors` | Admin | Instructors, course catalog, enrollments, sales, and income |
| PATCH | `/admin/users/:id/role` | Admin | Set role to student, instructor, or admin |
| GET | `/admin/analytics` | Admin | Platform totals, monthly revenue, course demand, and instructor income |
| GET | `/admin/payments` | Admin | Recent platform payment records |
| GET | `/admin/settings` | Admin | Environment capabilities and platform totals (no secrets) |

The Socket.IO connection authenticates using the same HTTP-only cookie. Clients join only their own `user:<id>` room; successful payment emits `enrollment:created` to that learner. Admin sockets also join `role:admin`.

## Important notes

- Profile and course cover uploads accept browser-recognized image formats and common image extensions (including AVIF, BMP, GIF, HEIC/HEIF, ICO, JPEG, PNG, SVG, TIFF, and WebP), up to 5 MB. The image host may reject formats it does not support.
- This API stores image URLs and Google Drive file IDs, not media binaries in MongoDB. Cloudinary remains in use only for course cover images; lesson videos are linked from Drive and are never uploaded by the website.
- Passwords are bcrypt-hashed; password-reset tokens are stored as SHA-256 hashes and expire after 15 minutes.
- Do not let clients submit a role during registration. Grant roles from the seeded admin account.
