# Staff Management System

A comprehensive staff management application built with React, TypeScript, Vite, and Supabase. Features attendance tracking, salary management, location management, and advanced filtering capabilities.

## 🌟 Features

### Core Features
- **Dashboard** - Real-time attendance overview with location-wise breakdown
- **Staff Management** - Add, edit, archive staff with salary hike tracking
- **Attendance Tracking** - Daily and monthly views with bulk actions
- **Salary Management** - Automated salary calculations with deductions and advances
- **Part-Time Staff** - Dedicated management for part-time employees
- **Old Staff Records** - Archive and rejoin functionality

### Advanced Features
- **Dynamic Location Management** - Add, edit, delete custom locations
- **Custom Salary Categories** - Create additional salary components
- **Admin-Only Filters** - Search and location filtering for administrators
- **Sticky Navigation** - Persistent navigation bar on desktop
- **Role-Based Access** - Admin and Manager roles with different permissions
- **Mobile Responsive** - Fully optimized for all screen sizes

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- npm or yarn
- Supabase account (for backend)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd staffmngt-bolt-app/project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key
   - Update `src/lib/supabase.ts` with your credentials:
     ```typescript
     const supabaseUrl = 'YOUR_SUPABASE_URL'
     const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'
     ```

4. **Run database migrations**
   - Execute the SQL schema from `src/lib/supabase.ts` comments in your Supabase SQL editor

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Build for production**
   ```bash
   npm run build
   ```

## 📦 Deployment

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Vite configuration
   - Click "Deploy"

3. **Set environment variables** (if using `.env`)
   - In Vercel project settings > Environment Variables
   - Add your Supabase credentials

### Deploy to Netlify

1. **Push to GitHub** (same as above)

2. **Deploy on Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" > "Import an existing project"
   - Connect to GitHub and select your repository
   - Build settings are auto-detected from `netlify.toml`
   - Click "Deploy site"

## 👤 Default Login Credentials

### Admin Account
- **Email:** `staff@admin.com`
- **Password:** `Staffans7369`
- **Access:** Full system access

### Manager Accounts
| Location | Email | Password |
|----------|-------|----------|
| Big Shop | `manager@bigshop.com` | `MngrBig25` |
| Small Shop | `manager@smallshop.com` | `MngrSml25` |
| Godown | `manager@godown.com` | `MngrGdn25` |

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript
- **Build Tool:** Vite 4.5
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Database:** Supabase (PostgreSQL)
- **PDF Export:** jsPDF, jsPDF-AutoTable
- **Excel Export:** xlsx

## 📁 Project Structure

```
project/
├── src/
│   ├── components/         # React components
│   │   ├── Dashboard.tsx
│   │   ├── StaffManagement.tsx
│   │   ├── AttendanceTracker.tsx
│   │   ├── SalaryManagement.tsx
│   │   └── ...
│   ├── services/          # API services
│   │   ├── staffService.ts
│   │   ├── attendanceService.ts
│   │   ├── settingsService.ts
│   │   └── ...
│   ├── types/             # TypeScript types
│   ├── utils/             # Utility functions
│   ├── lib/               # External library configs
│   └── App.tsx            # Main app component
├── public/                # Static assets
├── vercel.json           # Vercel configuration
├── netlify.toml          # Netlify configuration
└── package.json          # Dependencies
```

## 🎯 Key Features Guide

### Location Management
1. Navigate to **Staff Management**
2. Click **"Manage Locations"** button
3. Add new locations with the input box
4. Edit existing locations with ✏️ icon
5. Delete custom locations with 🗑️ icon
6. Default locations (Big Shop, Small Shop, Godown) are protected

### Salary Categories
1. In **Staff Management**, click **"Salary Categories"**
2. Add custom salary components
3. Edit category names inline
4. Delete unused categories
5. New fields automatically appear in staff forms

### Admin Filters (Attendance)
1. Login as admin
2. Navigate to **Attendance** page
3. Use the **search box** to filter by staff name
4. Use the **location dropdown** to filter by location
5. Filters work in real-time

## 🔧 Configuration

### Customize Default Values

**Locations** (in `src/services/settingsService.ts`):
```typescript
const DEFAULT_LOCATIONS = ['Big Shop', 'Small Shop', 'Godown'];
```

**Salary Categories**:
```typescript
const DEFAULT_SALARY_CATEGORIES = [
  { id: 'basic', name: 'Basic Salary', key: 'basicSalary' },
  { id: 'incentive', name: 'Incentive', key: 'incentive' },
  { id: 'hra', name: 'HRA', key: 'hra' }
];
```

## 📝 License

This project is private and proprietary.

## 🤝 Support

For issues and questions, please create an issue in the GitHub repository.

---

**Built with ❤️ using React + TypeScript + Vite**
