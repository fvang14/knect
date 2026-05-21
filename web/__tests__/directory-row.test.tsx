import { render, screen } from "@testing-library/react";
import { DirectoryRow } from "@/components/directory/directory-row";
import type { NearbyContractor } from "@/lib/types";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

const base: NearbyContractor = {
  user_id: "c1",
  display_name: "Sarah Khelka",
  bio: "Expert plumber",
  base_rate: 65,
  base_rate_unit: "per_hour",
  is_busy: false,
  avg_rating: 4.9,
  rating_count: 52,
  current_lat: null,
  current_lng: null,
  distance_meters: 640,
};

test("renders contractor name", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
});

test("renders rate", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("$65")).toBeInTheDocument();
});

test("renders bio", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("Expert plumber")).toBeInTheDocument();
});

test("shows Request button when available", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByRole("link", { name: /request/i })).toBeInTheDocument();
});

test("links to /login when not logged in", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByRole("link", { name: /request/i })).toHaveAttribute("href", "/login");
});

test("links to pro detail when logged in", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={true} />);
  expect(screen.getByRole("link", { name: /request/i })).toHaveAttribute("href", "/pro/c1");
});

test("shows 'On a job' when busy", () => {
  render(<DirectoryRow contractor={{ ...base, is_busy: true }} isLoggedIn={false} />);
  expect(screen.getByText(/on a job/i)).toBeInTheDocument();
});

test("hides Request button when busy", () => {
  render(<DirectoryRow contractor={{ ...base, is_busy: true }} isLoggedIn={false} />);
  expect(screen.queryByRole("link", { name: /request/i })).not.toBeInTheDocument();
});
