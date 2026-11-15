import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { FiLock, FiMail, FiAlertCircle, FiEye, FiEyeOff } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

const Login = () => {
  const { user, login, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Where to redirect after successful login
  const from = location.state?.from?.pathname || "/";

  // If already authenticated and not loading, redirect to intended page
  if (!authLoading && user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(trimmedEmail, password);
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Invalid email or password";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center p-3"
      style={{
        backgroundColor: "#f8f9fa",
        background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
      }}
    >
      <div
        className="card border shadow-sm rounded-4 p-4 p-sm-5 bg-white"
        style={{ maxWidth: "420px", width: "100%", borderColor: "#e2e8f0" }}
      >
        {/* Brand / Logo Header */}
        <div className="text-center mb-4">
          <div className="d-flex justify-content-center mb-3">
            <Logo height={48} />
          </div>
          <h2 className="h4 fw-bold text-dark mb-1">Sign In</h2>
          <p className="text-secondary small mb-0">
            Enter your credentials to access the POS system
          </p>
        </div>

        {/* Error Alert Message */}
        {errorMessage && (
          <div
            className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-4 rounded-3 border-danger-subtle"
            role="alert"
          >
            <FiAlertCircle size={18} className="flex-shrink-0 text-danger" />
            <div className="flex-grow-1">{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label small fw-medium text-dark">
              Email address
            </label>
            <div className="input-group">
              <span className="input-group-text bg-white text-secondary border-end-0">
                <FiMail size={16} />
              </span>
              <input
                id="login-email"
                type="email"
                className="form-control border-start-0 ps-1"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                disabled={isSubmitting}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="login-password" className="form-label small fw-medium text-dark">
              Password
            </label>
            <div className="input-group">
              <span className="input-group-text bg-white text-secondary border-end-0">
                <FiLock size={16} />
              </span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className="form-control border-start-0 border-end-0 ps-1"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                disabled={isSubmitting}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-group-text bg-white text-secondary border-start-0"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-dark w-100 py-2 fw-medium d-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;