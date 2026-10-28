import { useAuth } from './features/auth/useAuth.js';
import { useAppLock } from './features/appLock/useAppLock.js';
import HomePage from './pages/HomePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LockPage from './pages/LockPage.jsx';

// Pehle app password (sirf production me lagta hai), phir Zoho connect.
export default function App() {
  const lock = useAppLock();

  return (
    <div className="app-shell">
      {lock.unlocked === null ? null : lock.unlocked ? <Workspace /> : <LockPage lock={lock} />}
    </div>
  );
}

// Dashboard sirf tab dikhta hai jab Zoho account connected ho.
// Disconnect hone par backend status refresh hota hai aur user Home par aa jata hai.
function Workspace() {
  const auth = useAuth();
  return auth.status?.connected ? <DashboardPage auth={auth} /> : <HomePage auth={auth} />;
}
