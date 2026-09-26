import { Routes, Route, Navigate, useParams, useLocation } from '@/next/router';
import { useAuth } from './context/AuthContext';
import { FullscreenLoader } from './components/Loader';
import Login from './views/Login';
import PasswordReset from './views/PasswordReset';
import AdminDashboard from './views/admin/Dashboard';
import UserManagement from './views/admin/UserManagement';
import CandidateProfiles from './views/admin/CandidateProfiles';
import ProfileForm from './views/admin/ProfileForm';
import Assignments from './views/admin/Assignments';
import AdminApplications from './views/admin/Applications';
import AdminInterviewRequests from './views/admin/InterviewRequests';
import AdminSettings from './views/admin/Settings';
import AdminResumeTemplates from './views/admin/ResumeTemplates';
import Developers from './views/admin/Developers';
import AdminJobLinks from './views/admin/JobLinks';
import Inbox from './views/user/Inbox';
import JobLinkDetail from './views/JobLinkDetail';
import LumiBidPage from './views/LumiBidPage';
import UserDashboard from './views/user/Dashboard';
import UserStatsDashboard from './views/user/UserStatsDashboard';
import ProfileView from './views/user/ProfileView';
import ResumeGenerator from './views/user/ResumeGenerator';
import ResumeTemplateBuilder from './views/user/ResumeTemplateBuilder';
import Applications from './views/user/Applications';
import InterviewRequests from './views/user/InterviewRequests';
import AccountSettings from './views/user/AccountSettings';
import AutofillSettingsPage from './views/AutofillSettingsPage';
import BidderSettingsPage from './views/BidderSettingsPage';
import BidInsights from './views/user/BidInsights';
import Analyze from './views/user/Analyze';
import BidCourses from './views/user/BidCourses';
import CvQualityReport from './views/user/CvQualityReport';
import CallerDashboard from './views/caller/CallerDashboard';
import CallerProfile from './views/caller/CallerProfile';
import ManagerDashboard from './views/manager/Dashboard';
import ManagerProfileForm from './views/manager/ProfileForm';
import ManagerUsers from './views/manager/Users';
import DeveloperDashboard from './views/developer/DeveloperDashboard';
import DeveloperProfile from './views/developer/DeveloperProfile';
import Layout from './components/Layout';
import PipelineHub from './views/PipelineHub';
import PerformanceHub from './views/PerformanceHub';

function RedirectWithId({ toPrefix }) {
    const { id } = useParams();
    const location = useLocation();
    return <Navigate to={`${toPrefix}/${id}${location.search || ''}`} replace />;
}

function ProtectedRoute({ children, adminOnly = false, managerOnly = false, callerOnly = false }) {
    const { user, additionalRoles, loading } = useAuth();

    if (loading) {
        return <FullscreenLoader message="Loading your workspace..." />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const hasAdminRole = user.role === 'admin' || additionalRoles.includes('admin');
    const hasManagerRole = user.role === 'manager' || additionalRoles.includes('manager');
    const hasCallerRole = user.role === 'caller' || additionalRoles.includes('caller');

    if (adminOnly && !hasAdminRole) {
        return <Navigate to="/user/settings" replace />;
    }

    if (managerOnly && !hasManagerRole && !hasAdminRole) {
        return <Navigate to="/user/settings" replace />;
    }

    if (callerOnly && !hasCallerRole && !hasAdminRole) {
        return <Navigate to="/user/settings" replace />;
    }

    return children;
}

function App() {
    const { user, additionalRoles, loading } = useAuth();

    if (loading) {
        return <FullscreenLoader message="Loading your workspace..." />;
    }

    return (
        <Routes>
            <Route path="/login" element={
                user ? <Navigate to={
                    user.role === 'admin' || additionalRoles.includes('admin') ? '/admin/settings' :
                    user.role === 'caller' || additionalRoles.includes('caller') ? '/caller/settings' :
                    user.role === 'manager' || additionalRoles.includes('manager') ? '/manager/settings' :
                    user.role === 'developer' || additionalRoles.includes('developer') ? '/developer/settings' :
                    '/user/settings'
                } replace /> : <Login />
            } />
            <Route path="/reset-password" element={
                <ProtectedRoute adminOnly>
                    <PasswordReset />
                </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<UserManagement />} />
                <Route path="developers" element={<Developers />} />
                <Route path="profiles" element={<CandidateProfiles />} />
                <Route path="profiles/new" element={<ProfileForm />} />
                <Route path="profiles/:id/edit" element={<ProfileForm />} />
                <Route path="autofill-settings" element={<AutofillSettingsPage />} />
                <Route path="bidder-settings" element={<BidderSettingsPage />} />
                <Route path="assignments" element={<Assignments />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="mailbox" element={<Inbox />} />
                <Route path="resume-templates" element={<AdminResumeTemplates />} />

                <Route path="pipeline" element={<PipelineHub />}>
                    <Route index element={<AdminJobLinks embedded />} />
                    <Route path="lumi" element={<LumiBidPage />} />
                    <Route path="applications" element={<AdminApplications embedded />} />
                    <Route path="interviews" element={<AdminInterviewRequests embedded />} />
                    <Route path="links/:id" element={<JobLinkDetail />} />
                </Route>
                <Route path="performance" element={<PerformanceHub />}>
                    <Route index element={<BidCourses embedded />} />
                    <Route path="courses/:id" element={<BidCourses embedded />} />
                    <Route path="analyze" element={<Analyze embedded />} />
                </Route>

                {/* Legacy redirects — preserve bookmarks */}
                <Route path="applications" element={<Navigate to="/admin/pipeline/applications" replace />} />
                <Route path="interviews" element={<Navigate to="/admin/pipeline/interviews" replace />} />
                <Route path="job-links" element={<Navigate to="/admin/pipeline" replace />} />
                <Route path="job-links/:id" element={<RedirectWithId toPrefix="/admin/pipeline/links" />} />
                <Route path="bid-courses" element={<Navigate to="/admin/performance" replace />} />
                <Route path="bid-courses/:id" element={<RedirectWithId toPrefix="/admin/performance/courses" />} />
                <Route path="analyze" element={<Navigate to="/admin/performance/analyze" replace />} />
            </Route>

            {/* User Routes */}
            <Route path="/user" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="profiles" element={<UserDashboard />} />
                <Route path="dashboard" element={<UserStatsDashboard />} />

                <Route path="pipeline" element={<PipelineHub />}>
                    <Route index element={<AdminJobLinks embedded />} />
                    <Route path="lumi" element={<LumiBidPage />} />
                    <Route path="applications" element={<Applications embedded />} />
                    <Route path="interviews" element={<InterviewRequests embedded />} />
                    <Route path="links/:id" element={<JobLinkDetail />} />
                </Route>
                <Route path="performance" element={<PerformanceHub />}>
                    <Route index element={<BidCourses embedded />} />
                    <Route path="courses/:id" element={<BidCourses embedded />} />
                    <Route path="insights" element={<BidInsights embedded />} />
                    <Route path="analyze" element={<Analyze embedded />} />
                </Route>

                {/* Legacy redirects */}
                <Route path="applications" element={<Navigate to="/user/pipeline/applications" replace />} />
                <Route path="job-links" element={<Navigate to="/user/pipeline" replace />} />
                <Route path="job-links/:id" element={<RedirectWithId toPrefix="/user/pipeline/links" />} />
                <Route path="interviews" element={<Navigate to="/user/pipeline/interviews" replace />} />
                <Route path="bid-insights" element={<Navigate to="/user/performance/insights" replace />} />
                <Route path="analyze" element={<Navigate to="/user/performance/analyze" replace />} />
                <Route path="bid-courses" element={<Navigate to="/user/performance" replace />} />
                <Route path="bid-courses/:id" element={<RedirectWithId toPrefix="/user/performance/courses" />} />

                <Route path="profile/:id" element={<ProfileView />} />
                <Route path="generate" element={<ResumeGenerator />} />
                <Route path="generate/:profileId" element={<ResumeGenerator />} />
                <Route path="cv-quality" element={<CvQualityReport />} />
                <Route path="cv-quality/:applicationId" element={<CvQualityReport />} />
                <Route path="templates" element={<ResumeTemplateBuilder />} />
                <Route path="templates/:templateId" element={<ResumeTemplateBuilder />} />
                <Route path="autofill-settings" element={<AutofillSettingsPage />} />
                <Route path="bidder-settings" element={<BidderSettingsPage />} />
                <Route path="settings" element={<AccountSettings />} />
                <Route path="inbox" element={<Inbox />} />
            </Route>

            {/* Caller Routes */}
            <Route path="/caller" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="dashboard" element={<CallerDashboard />} />
                <Route path="profile" element={<CallerProfile />} />
                <Route path="settings" element={<AccountSettings />} />
            </Route>

            {/* Manager Routes */}
            <Route path="/manager" element={
                <ProtectedRoute managerOnly>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="dashboard" element={<ManagerDashboard />} />
                <Route path="profiles/new" element={<ManagerProfileForm />} />
                <Route path="profiles/:id/edit" element={<ManagerProfileForm />} />
                <Route path="autofill-settings" element={<AutofillSettingsPage />} />
                <Route path="bidder-settings" element={<BidderSettingsPage />} />
                <Route path="users" element={<ManagerUsers />} />
                <Route path="settings" element={<AccountSettings />} />
            </Route>

            {/* Developer Routes */}
            <Route path="/developer" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="dashboard" element={<DeveloperDashboard />} />
                <Route path="profile" element={<DeveloperProfile />} />
                <Route path="settings" element={<AccountSettings />} />
            </Route>

            {/* Default redirect */}
            <Route path="*" element={
                <Navigate to={
                    user ? (
                        user.role === 'admin' || additionalRoles.includes('admin') ? '/admin/settings' :
                        user.role === 'caller' || additionalRoles.includes('caller') ? '/caller/settings' :
                        user.role === 'manager' || additionalRoles.includes('manager') ? '/manager/settings' :
                        user.role === 'developer' || additionalRoles.includes('developer') ? '/developer/settings' :
                        '/user/settings'
                    ) : '/login'
                } replace />
            } />
        </Routes>
    );
}

export default App;
