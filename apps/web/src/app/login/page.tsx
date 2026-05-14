import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <main style={{ marginTop: '4rem', textAlign: 'center' }}>
      <h1>Daily Report</h1>
      <p style={{ color: '#666' }}>Admin sign-in required.</p>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/topics' });
        }}
      >
        <button type="submit" style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}>
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
