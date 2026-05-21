import { useEffect } from "react";
import { useLocation, useRouter } from "wouter";

/**
 * Route protection middleware - redirects to login if no auth token
 * Protects all routes except /login and public pages
 */
export function useAuthProtection() {
  const [location, navigate] = useLocation();
  
  const publicRoutes = ["/login"];
  const isPublicRoute = publicRoutes.includes(location);
  
  useEffect(() => {
    const token = localStorage.getItem("token");
    const isAuthenticated = !!token;
    
    // If not authenticated and not on public route, redirect to login
    if (!isAuthenticated && !isPublicRoute) {
      navigate("/login", { replace: true });
    }
    
    // If authenticated and on login page, redirect to dashboard
    if (isAuthenticated && location === "/login") {
      navigate("/", { replace: true });
    }
  }, [location, navigate, isPublicRoute]);
}

/**
 * Protected route wrapper component
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;
  
  const publicRoutes = ["/login"];
  const isPublicRoute = publicRoutes.includes(location);
  
  // If route requires auth and user is not authenticated, don't render
  if (!isPublicRoute && !isAuthenticated) {
    return null;
  }
  
  return <>{children}</>;
}
