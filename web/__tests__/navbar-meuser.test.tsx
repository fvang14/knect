import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/ui/navbar";
import { useMeUser } from "@/components/providers/providers";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

jest.mock("@/components/providers/providers", () => ({
  useMeUser: jest.fn(),
}));

jest.mock("@/lib/me", () => ({
  avatarUrl: (userId: string, avatarUpdatedAt?: string | null) =>
    avatarUpdatedAt ? `/users/${userId}/avatar?t=123` : "",
  fetchMe: jest.fn(),
}));

const mockUseMeUser = useMeUser as jest.MockedFunction<typeof useMeUser>;

test("logged-out: shows Sign in and Get started", () => {
  mockUseMeUser.mockReturnValue({ meUser: null, setMeUser: jest.fn() });
  render(<Navbar />);
  expect(screen.getByText("Sign in")).toBeInTheDocument();
  expect(screen.getByText("Get started")).toBeInTheDocument();
});

test("logged-out: does not show My jobs", () => {
  mockUseMeUser.mockReturnValue({ meUser: null, setMeUser: jest.fn() });
  render(<Navbar />);
  expect(screen.queryByText("My jobs")).not.toBeInTheDocument();
});

test("logged-in: shows My jobs and user displayName", () => {
  mockUseMeUser.mockReturnValue({
    meUser: {
      id: "user-123",
      email: "test@example.com",
      role: "customer",
      display_name: "Alice Smith",
      has_avatar: false,
      avatar_updated_at: null,
    },
    setMeUser: jest.fn(),
  });
  render(<Navbar />);
  expect(screen.getByText("My jobs")).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
});

test("logged-in: does not show Sign in", () => {
  mockUseMeUser.mockReturnValue({
    meUser: {
      id: "user-123",
      email: "test@example.com",
      role: "customer",
      display_name: "Alice Smith",
      has_avatar: false,
      avatar_updated_at: null,
    },
    setMeUser: jest.fn(),
  });
  render(<Navbar />);
  expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
});

test("always shows Knect wordmark", () => {
  mockUseMeUser.mockReturnValue({ meUser: null, setMeUser: jest.fn() });
  render(<Navbar />);
  expect(screen.getByText("Knect")).toBeInTheDocument();
});
