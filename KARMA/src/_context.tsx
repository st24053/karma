import React, { createContext, useContext, useState, useEffect } from 'react';

type UserRole = 'student' | 'teacher' | null;

const AuthContext = createContext<{
  role: UserRole;
  email: string | null; 
  signIn: (role: 'student' | 'teacher', email?: string) => void;
  signOut: () => void;
}>({ 
  role: null, 
  email: null, // Default placeholder value
  signIn: () => {}, 
  signOut: () => {} 
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>(null);
  const [email, setEmail] = useState<string | null>(null);

  // Read cookies/localStorage on mount so users don't get signed out
  useEffect(() => {
    const savedRole = localStorage.getItem('karma_role');
    const savedEmail = localStorage.getItem('karma_email');
    if (savedRole) {
      setRole(savedRole as UserRole);
      setEmail(savedEmail);
    }
  }, []);

  const signIn = (selectedRole: 'student' | 'teacher', userEmail?: string) => {
    const assignedEmail = userEmail || `${selectedRole}@ormiston.school.nz`;
    
    setRole(selectedRole);
    setEmail(assignedEmail);

    // Persist via Web LocalStorage 
    localStorage.setItem('karma_role', selectedRole);
    localStorage.setItem('karma_email', assignedEmail);
  };

  const signOut = () => {
    setRole(null);
    setEmail(null);
    
    localStorage.removeItem('karma_role');
    localStorage.removeItem('karma_email');
  };

  return (
    <AuthContext.Provider value={{ role, email, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}