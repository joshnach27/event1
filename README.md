# EventHub: Event Management System

A responsive, dark-themed event management app built with HTML, CSS, Bootstrap 5, vanilla JavaScript (ES modules),
Firebase Authentication, Cloud Firestore, and Firebase Hosting. Two roles: **Admin** and **Student**.

## Project structure

```
event-management-system/
├── index.html            Landing page
├── login.html            Sign-in for students and admins (role-based redirect)
├── signup.html           Student self-registration (no admin signup page)
├── student.html          Student dashboard
├── admin.html            Admin dashboard
├── css/style.css         Dark neon theme, animations, responsive styles
├── js/
│   ├── firebase-config.js  Firebase config (project event-a1159)
│   ├── common.js           Shared helpers: toasts, confirm dialog, validation, role guard
│   ├── login.js            Login logic
│   ├── signup.js           Student signup with atomic roll-number reservation
│   ├── student.js          Browse events, register, cancel
│   └── admin.js            Event CRUD, attendees, student management
├── firestore.rules       Security rules (role-based access, uniqueness, capacity)
├── firebase.json         Firestore + Hosting configuration
├── .firebaserc           Project alias (event-a1159)
└── scripts/
    ├── admin-tools.mjs   Admin SDK tool: create admins, delete Auth users (run locally only)
    └── package.json
```

## 1. Firebase console setup (project `event-a1159`)

1. **Authentication**: Build > Authentication > Get started > Sign-in method > enable **Email/Password**.
2. **Firestore**: Build > Firestore Database > Create database. Choose a region and start in production mode
   (the rules in this project replace the default ones when you deploy).
3. **Web app config**: Project settings > General > Your apps > Add app (Web, `</>`) if none exists. Copy the
   `apiKey`, `messagingSenderId` and `appId` values into `js/firebase-config.js`, replacing the three
   `REPLACE_WITH_*` placeholders. `authDomain`, `projectId` and `storageBucket` are already set.

## 2. Create the first admin account securely

There is no admin signup page, by design. Choose one of these two methods.

### Option A: Admin SDK script (recommended)

Uses your own Google credentials, so no key file is stored in the project.

```bash
npm install -g firebase-tools              # if not already installed
gcloud auth application-default login      # needs Google Cloud SDK; sign in with the project owner account
cd scripts
npm install
node admin-tools.mjs create-admin "admin@yourcollege.edu" "Str0ng!Passw0rd" "Your Name"
```

The script creates the Auth user and a `users/{uid}` document with `role: "admin"`.

### Option B: Firebase console (manual)

1. Authentication > Users > **Add user**: enter the admin email and a strong password. Copy the **User UID**.
2. Firestore Database > Start collection `users` > Document ID = **the UID**, then add fields:

| Field      | Type      | Value                 |
|------------|-----------|-----------------------|
| fullName   | string    | Your Name             |
| email      | string    | admin@yourcollege.edu |
| role       | string    | `admin`               |
| status     | string    | `active`              |
| createdAt  | timestamp | (now)                 |

Students cannot create or change their own `role`. The rules allow a student profile to be created only
with `role: "student"`, so the only ways to get an admin are the console or the Admin SDK.

## 3. Run locally

Modules and Firebase Auth need HTTP, not `file://`:

```bash
cd event-management-system
python3 -m http.server 8080      # or: npx serve .
```

Open http://localhost:8080. (If you use Firebase emulators, change `js/firebase-config.js` accordingly.)

## 4. Deploy

```bash
firebase login
firebase use event-a1159
firebase deploy --only firestore:rules,hosting
```

Your site is live at `https://event-a1159.web.app` (and `https://event-a1159.firebaseapp.com`).

## 5. How the security works

| Concern | Enforcement |
|---|---|
| Admin-only areas | Role read from `users/{uid}.role` in Firestore Rules. Frontend guards are UX only. |
| Students cannot become admins | Student profile create rule requires `role == 'student'` and `status == 'active'`. |
| Duplicate roll numbers | `rollNumbers/{roll}` is created in a transaction with the profile. Create-only, so a duplicate fails atomically, even under simultaneous sign-ups. |
| Duplicate emails | Enforced by Firebase Authentication (one account per email). |
| Duplicate registrations | Registration doc ID is `eventId_uid`. A second create fails, and the transaction also checks first. |
| Overbooking / race conditions | Registration runs in a Firestore transaction that re-reads seat count. Rules allow `registeredCount` to change only by ±1 and never above capacity. |
| Disabled accounts | Admin sets `status: "disabled"`. Login and the role guard refuse disabled accounts, and rules deny their reads and writes. |
| Admin edits | Capacity cannot be set below the current registration count (client check and rule). |

## 6. Removing students

- **Remove student** (dashboard button) cancels their registrations, frees seats, releases their roll number, and
  deletes the profile. They can no longer sign in, because login and the role guard require a profile.
- To also delete the Firebase Auth login (so the email can be reused), run:
  `node scripts/admin-tools.mjs delete-auth-user <uid>` (the UID is in Firebase console > Authentication).

## 7. Testing checklist

1. Sign up as a student. Try a duplicate email, an existing roll number, a weak password and a bad roll number.
2. Log in as a student. Verify the dashboard loads, you can register, you cannot register twice, and cancelling works.
3. Open the same student in two browser windows and register for the last seat in both. Only one should succeed.
4. Log in as admin. Create, edit and delete an event. Check that deleting an event removes its registrations.
5. Open attendees, remove a registration, and confirm the seat count goes down.
6. Disable a student, then confirm they cannot sign in. Re-enable them.
7. In the browser console, try to write to `users` or `events` as a student. The rules should return
   `permission-denied`.

## Known limitations (for production hardening)

- Roll numbers are **self-declared** at signup. The rules guarantee uniqueness, not validity. To verify roll numbers
  against your college records, have admins approve accounts or run a Cloud Function that checks an official list.
- `rollNumbers` reads are allowed for signed-in users, so a student can check whether a roll number is taken.
  This is needed for the signup transaction; the risk is low, but it is not zero.
- Registrations and seat counts are maintained by the client inside transactions. For stricter control (for
  example, payments or waitlists), move these operations into Cloud Functions.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). Requires JavaScript and internet access (Bootstrap and
Firebase are loaded from CDNs).
