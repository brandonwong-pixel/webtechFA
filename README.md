# Quest Housing Sales

A housing sales and buyer management website built from the supplied starter project. It uses HTML, an external CSS file, browser JavaScript, Express.js and MySQL.

## What the application does

- Sign up and sign in. Passwords are stored with `bcrypt` using 10 salt rounds.
- Create, view, edit and delete property units, buyers and announcements.
- Add, edit, complete and delete dated buyer follow-up reminders. Each reminder is linked to one buyer in MySQL.
- Mark a buyer's property as sold in one MySQL transaction. The transaction updates the unit, marks the buyer as sold, and cancels other pending buyers for that unit.
- View a live snapshot using the Open-Meteo Geocoding API, Open-Meteo Weather API and Frankfurter exchange-rate API. The Express route combines their JSON responses for the home page.
- Uses input checks and MySQL placeholders (`?`) in database queries. Browser output for user-entered text is escaped using a small `textContent` helper.

## Run the project locally

1. Install Node.js, XAMPP and Git. Start MySQL from the XAMPP Control Panel.
2. Open phpMyAdmin and import `schema.sql`. It creates the `housing_sales` database and all required tables. If you already have an older `units` table, run `migrate_units.sql` once to add the property image column.
3. In this folder, copy `.env.example` to `.env`. Enter the local MySQL username and password. The `dotenv` package loads these settings when `server.js` starts. Do not commit `.env`.
4. Open a terminal in this folder and run:

   ```text
   npm install
   npm start
   ```

5. Visit `http://localhost:3000`. Create an account. Passwords must be 8-12 characters and include uppercase, lowercase, a number and a symbol, as shown in the course practical.

The live data card needs an internet connection. It displays an error message when a third-party API is unavailable. No API keys are needed for these three services.

## Assessment tasks covered in the code

- **Task 1:** `/api/insights` is the Express middleware route for three external API services. It validates the city input, calls the services, and returns one normalized JSON response.
- **Task 2:** MySQL stores the core records. `buyer_followups` is the added relational feature table. `/api/followups` supports create, read, update and delete. Completing a sale uses a database transaction.
- **Task 3:** Signup validates the username and course password rules; login checks the stored `bcrypt` hash. Database queries use parameter placeholders to prevent SQL injection. Dynamic browser text uses `textContent` before insertion into HTML.
- **Task 4:** `.env.example` shows the required settings and `.gitignore` excludes `.env` and `node_modules`. Use Git to save local milestones. For deployment, follow these steps with the cloud service covered in your class: (1) create a GitHub repository and push your local project; (2) create a Node.js web service connected to that repository; (3) create or select a hosted MySQL database and import `schema.sql`; (4) enter `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and `PORT` in the cloud service environment settings; (5) set the build command to `npm install` and the start command to `npm start`; (6) deploy, then open the provided application URL and check the database and external API card. Do not upload `.env`.

A cloud account, repository URL and hosted database were not supplied, so the source includes the deployment setup guide but no live URL.



