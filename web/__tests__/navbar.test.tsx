import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/ui/navbar";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

test("logged-out: shows Sign in and Get started", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.getByText("Sign in")).toBeInTheDocument();
  expect(screen.getByText("Get started")).toBeInTheDocument();
});

test("logged-out: does not show My jobs", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.queryByText("My jobs")).not.toBeInTheDocument();
});

test("logged-in: shows My jobs", () => {
  render(<Navbar isLoggedIn={true} />);
  expect(screen.getByText("My jobs")).toBeInTheDocument();
});

test("logged-in: does not show Sign in", () => {
  render(<Navbar isLoggedIn={true} />);
  expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
});

test("always shows Knect wordmark", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.getByText("Knect")).toBeInTheDocument();
});
