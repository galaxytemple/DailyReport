import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-sm w-full">
        <h1 className="text-2xl font-semibold">Daily Report</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">Admin sign-in required.</p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/themes' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-blue-700"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
