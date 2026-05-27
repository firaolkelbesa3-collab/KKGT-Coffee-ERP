import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, Mail } from "lucide-react";

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center">
          <Clock className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-900">Pending administrator approval</h1>
          <p className="text-sm text-slate-600">
            Your account is signed in but does not yet have a role assigned. An administrator must
            grant you access before you can use the app.
          </p>
        </div>

        {user?.email && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 flex items-center justify-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="font-medium">{user.email}</span>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Share this email with your administrator so they can grant you a role on the
          Permissions screen.
        </p>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
