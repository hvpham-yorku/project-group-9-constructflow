/**
 * auth.test.jsx
 *
 * Test suite for authentication functionality including login and logout.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AuthModal from "../components/AuthModal";
import Header from "../components/Header";
import { AuthProvider } from "../contexts/AuthContext";
import * as firebaseAuth from "firebase/auth";

// Mock Firebase Auth module
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((auth, callback) => {
    callback(null);
    return vi.fn();
  }),
}));

// Mock Firebase config
vi.mock("../firebase", () => ({
  auth: {},
}));

// Mock react-icons
vi.mock("react-icons/md", () => ({
  MdNotifications: () => <div>NotificationIcon</div>,
  MdPerson: () => <div>PersonIcon</div>,
}));

describe("Authentication Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Signing in to an account that already exists with right password
  it("should successfully log in with valid credentials (abood1clasher@gmail.com / 123456)", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();

    // Mock successful login
    firebaseAuth.signInWithEmailAndPassword.mockResolvedValue({
      user: { email: "abood1clasher@gmail.com" },
    });

    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={mockOnClose} />
      </AuthProvider>,
    );

    // Fill in the form
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    await user.type(emailInput, "abood1clasher@gmail.com");
    await user.type(passwordInput, "123456");

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    // Verify login was called with correct credentials
    await waitFor(() => {
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "abood1clasher@gmail.com",
        "123456",
      );
    });

    // Verify modal closes on successful login
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  // Test 2: Logging out actually logs user out
  it("should successfully log out when clicking logout button", async () => {
    const user = userEvent.setup();

    // Mock a logged-in user
    const mockUser = { email: "abood1clasher@gmail.com" };
    firebaseAuth.onAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return vi.fn();
    });

    // Mock successful logout
    firebaseAuth.signOut.mockResolvedValue();

    render(
      <AuthProvider>
        <Header title="Dashboard" />
      </AuthProvider>,
    );

    // Wait for user to be loaded
    await waitFor(() => {
      expect(screen.getByText("abood1clasher@gmail.com")).toBeInTheDocument();
    });

    // Find and click the logout button
    const logoutButton = screen.getByRole("button", { name: /logout/i });
    await user.click(logoutButton);

    // Verify logout was called
    await waitFor(() => {
      expect(firebaseAuth.signOut).toHaveBeenCalled();
    });
  });

  // Test 3: Signing in to an account that doesn't exist with any password
  it("should fail to log in with non-existent account (abood2clasher@gmail.com / 123456)", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();

    // Mock failed login (user not found)
    firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(
      new Error("Firebase: Error (auth/user-not-found)."),
    );

    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={mockOnClose} />
      </AuthProvider>,
    );

    // Fill in the form
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    await user.type(emailInput, "abood2clasher@gmail.com");
    await user.type(passwordInput, "123456");

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    // Verify login was attempted
    await waitFor(() => {
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "abood2clasher@gmail.com",
        "123456",
      );
    });

    // Verify error message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /Firebase: Error \(auth\/user-not-found\)|Failed to authenticate/i,
        ),
      ).toBeInTheDocument();
    });

    // Verify modal does NOT close on failed login
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  // Test 4: Signing in to an account that exists with wrong password
  it("should fail to log in with wrong password (abood1clasher@gmail.com / 123457)", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();

    // Mock failed login (wrong password)
    firebaseAuth.signInWithEmailAndPassword.mockRejectedValue(
      new Error("Firebase: Error (auth/wrong-password)."),
    );

    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={mockOnClose} />
      </AuthProvider>,
    );

    // Fill in the form
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    await user.type(emailInput, "abood1clasher@gmail.com");
    await user.type(passwordInput, "123457");

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    // Verify login was attempted
    await waitFor(() => {
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "abood1clasher@gmail.com",
        "123457",
      );
    });

    // Verify error message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /Firebase: Error \(auth\/wrong-password\)|Failed to authenticate/i,
        ),
      ).toBeInTheDocument();
    });

    // Verify modal does NOT close on failed login
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
