import { useState } from 'react';
import { Link, Navigate, useNavigate } from '@/next/router';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/AuthLayout';

function PasswordReset() {
    const navigate = useNavigate();
    const { user, additionalRoles, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [resetData, setResetData] = useState({ username: '', newPassword: '', confirmPassword: '' });

    const isAdmin = user?.role === 'admin' || additionalRoles?.includes('admin');

    if (authLoading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!isAdmin) return <Navigate to="/user/settings" replace />;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setResetData((prev) => ({ ...prev, [name]: value }));
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!resetData.username || !resetData.newPassword || !resetData.confirmPassword) {
            setError('All fields are required');
            return;
        }
        if (resetData.newPassword.length < 6) {
            setError('New password must be at least 6 characters');
            return;
        }
        if (resetData.newPassword !== resetData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await authAPI.resetPassword(resetData.username, resetData.newPassword);
            setSuccess(`Password updated for ${resetData.username}.`);
            setResetData({ username: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => navigate('/admin/users'), 1500);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Reset user password" subtitle="Admin only — set a new password for any account">
            {success && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{success}</span>
                </div>
            )}
            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" name="username" value={resetData.username} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="newPassword">New password</Label>
                    <Input id="newPassword" name="newPassword" type="password" value={resetData.newPassword} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input id="confirmPassword" name="confirmPassword" type="password" value={resetData.confirmPassword} onChange={handleChange} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full rounded-xl" size="lg" variant="gradient">
                    {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>) : 'Update password'}
                </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
                <Link to="/admin/users" className="font-semibold text-primary hover:underline">Back to users</Link>
            </p>
        </AuthLayout>
    );
}

export default PasswordReset;
