import React from 'react';
import "./index.css"
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Tables from './pages/TableMap';
import AIAssistantPage from './pages/AIAssistantPage';
import SignUp from './pages/SignUp';
import AfterOrder from "./pages/AfterOrder";
import TableSelector from './pages/TableSelector';
import LoginAd from './pages/LoginAd';
import LoginCW from './pages/LoginCW';
import Assistant from './pages/Assistant';
import SignUpAdmin from "./pages/SignUpAdmin";
import CookDashboard from "./pages/CookDashboard";
import SignUpStaff from "./pages/SignUpStaff";
import WaiterDashboard from "./pages/WaiterDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Bill from "./pages/Bill";
import ThankYou from "./pages/Thankyou";
import HomePage from "./pages/HomePage";
import MenuPage from "./pages/MenuPage";
import { ProtectedRoute, RedirectIfAuthenticated } from "./components/AuthRoutes";
import SessionTracker from "./components/SessionTracker";

function App() {
  return (
    <Router>
      <SessionTracker />

      <Routes>
        <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
        <Route path="/login-admin" element={<RedirectIfAuthenticated><LoginAd /></RedirectIfAuthenticated>} />
        <Route path="/login-cw" element={<RedirectIfAuthenticated><LoginCW /></RedirectIfAuthenticated>} />
        <Route path="/signup-admin" element={<RedirectIfAuthenticated><SignUpAdmin /></RedirectIfAuthenticated>} />
        <Route path="/signup-staff" element={<RedirectIfAuthenticated><SignUpStaff /></RedirectIfAuthenticated>} />
        <Route path="/assistant" element={<ProtectedRoute roleScope="user"><Assistant /></ProtectedRoute>} />
        <Route path="/cook-dashboard" element={<ProtectedRoute roleScope="staff" allowedRoles={["cook"]}><CookDashboard /></ProtectedRoute>} />
        <Route path="/TableSelector" element={<ProtectedRoute roleScope="user"><TableSelector/></ProtectedRoute>} />
        <Route path="/signup" element={<RedirectIfAuthenticated><SignUp/></RedirectIfAuthenticated>} />
        <Route path="/after-order" element={<ProtectedRoute roleScope="user"><AfterOrder/></ProtectedRoute>} />
	<Route path="/ai-assistant" element={<ProtectedRoute roleScope="user"><AIAssistantPage /></ProtectedRoute>} />
	<Route path="/tables" element={<ProtectedRoute roleScope="user"><Tables /></ProtectedRoute>} />
        <Route path="/waiter-dashboard" element={<ProtectedRoute roleScope="staff" allowedRoles={["waiter"]}><WaiterDashboard /></ProtectedRoute>} />
        <Route path="/" element={<HomePage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/admin-dashboard" element={<ProtectedRoute roleScope="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/bill" element={<ProtectedRoute roleScope="user"><Bill /></ProtectedRoute>} />
        <Route path="/thank-you" element={<ProtectedRoute roleScope="user"><ThankYou /></ProtectedRoute>} />
      </Routes>
    </Router>
  );
}

export default App;
