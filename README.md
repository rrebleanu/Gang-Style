# GangStyle - Premium Barber Shop Booking Platform

## 1. Description and Problem Solved
GangStyle is a white-label booking platform built for an independent barber shop. 
**Problem solved:** It eliminates the stress of phone appointments, prevents human errors (overlapping bookings, incomplete appointment lists), and removes the need for expensive digital platforms (marketplace-style) that charge commissions and promote direct competition. It also solves the problem of unreliable clients ("no-shows") through an automated backend blacklist system.

## 2. Target Users & Core Features (MVP)
* **Clients (No account required):** Can access the platform via organic search or a direct barber link (e.g., `gangstyle.ro/alex`). Features include custom pricing based on the barber, real-time available slots to prevent overlaps, and "Invisible Retention" (using `localStorage` to save contact info and the preferred barber for faster future bookings).
* **Barbers (Role: BARBER):** Have a personalized dashboard to view their daily schedule chronologically, manage their own clients, and create/update their own service packages and prices.
* **Administrator (Role: ADMIN):** Acts as a barber but also has global control. Can manage any team member's services, global working hours, and the Anti-No-Show Blacklist system (blocks phone numbers of clients who do not show up).

## 3. Tech Stack
* **Frontend:** Angular 
* **Backend:** Java Spring Boot
* **Database:** MongoDB
* **Security:** Spring Security, JWT (JSON Web Tokens), BCrypt, TOTP (Two-Factor Authentication)
* **Version Control:** Git & GitHub

## 4. Architecture
The application follows a standard decoupled architecture:
* **Client-Side:** Single Page Application (SPA) built with Angular, communicating via HTTP requests.
* **Server-Side:** RESTful API built with Spring Boot, structured with Controllers, Services, and Repositories.
* **Database:** NoSQL MongoDB for flexible document storage.

## 5. Database Model (MongoDB Collections)
* `users`: Stores staff credentials, hashed passwords, roles, and 2FA secrets.
* `barbers`: Public profiles (name, specializations, URL slug).
* `services`: (CRUD 1) Packages, prices, and durations assigned to specific barbers.
* `appointments`: (CRUD 2) Booking details (client name, phone, date, time, status).
* `blacklist`: Phone numbers blocked by the Anti-No-Show system.

## 6. Local Setup and Running Instructions
### Prerequisites
* Node.js & npm (for Angular)
* Java 17+ & Maven (for Spring Boot)
* MongoDB (running locally or via Atlas)

### Backend (Spring Boot)
1. Navigate to the backend folder: `cd gangstyle-backend`
2. Configure your environment variables (see section 7).
3. Run the application: `mvn spring-boot:run` (Starts on `http://localhost:8080`)

### Frontend (Angular)
1. Navigate to the frontend folder: `cd gangstyle-frontend`
2. Install dependencies: `npm install`
3. Start the development server: `ng serve` (Starts on `http://localhost:4200`)

## 7. Environment Variables
Sensitive data is kept out of Git using environment variables. To run the backend, configure the following in your environment or `application.properties`:
* `MONGODB_URI` = (Your MongoDB connection string)
* `JWT_SECRET` = (A secure random string for token generation)
* `JWT_EXPIRATION` = (e.g., 86400000 for 24h)

## 8. Demo Accounts
*(To be filled before final delivery)*
* **Admin:** `admin@gangstyle.ro` / `password123`
* **Barber:** `alex@gangstyle.ro` / `password123`

## 9. Key Technical Decisions
* **Invisible Retention vs. User Accounts:** Clients do not create accounts. `localStorage` is used to remember returning clients, offering a frictionless UX while complying with privacy standards.
* **MongoDB:** Chosen for its document-oriented structure, allowing flexible schemas for dynamic service packages.
* **Direct Barber Routing (`/:slug`):** Bypasses the generic selection screen to help barbers retain their personal client base efficiently.

## 10. Security Implementations
* **Authentication:** Stateless authentication using JWT.
* **2FA (Two-Factor Authentication):** Mandatory TOTP (Google Authenticator) for staff login.
* **Authorization:** Role-based access control (`BARBER`, `ADMIN`) enforced on the backend via Spring Security.
* **Anti-IDOR:** Backend verifies ownership before allowing CRUD operations on appointments and services.
* **Data Protection:** Passwords are hashed using BCrypt. Secrets are excluded from version control. 

## 11. Future Improvements (Post-MVP)
* Automated SMS or email notifications for client confirmations.
* Advanced graphical statistics for monthly revenue.
* Online card payment integration.

## 12. AI Usage
AI assistants were used primarily as a learning accelerator and syntax guide. 
* *Note: A detailed log of prompts, accepted solutions, and technical decisions made by the intern is maintained in the `AI_LOG.md` file located in the root directory.*
