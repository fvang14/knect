import { render, screen } from "@testing-library/react";
import { DirectoryList } from "@/components/directory/directory-list";
import type { NearbyContractor } from "@/lib/types";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

const makeContractor = (id: string, name: string): NearbyContractor => ({
  user_id: id,
  display_name: name,
  bio: null,
  base_rate: 65,
  base_rate_unit: "per_hour",
  is_busy: false,
  avg_rating: 4.5,
  rating_count: 10,
  current_lat: null,
  current_lng: null,
  distance_meters: 500,
});

const contractors = [
  makeContractor("c1", "Sarah Khelka"),
  makeContractor("c2", "Marcus Tate"),
];

test("renders all contractor names", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
});

test("shows All chip as active by default", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  const allBtn = screen.getByRole("button", { name: /^all/i });
  expect(allBtn).toHaveClass("bg-slate-900");
});

test("shows count in All chip", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
});

test("shows empty state when no contractors", () => {
  render(<DirectoryList contractors={[]} isLoggedIn={false} />);
  expect(screen.getByText(/no pros/i)).toBeInTheDocument();
});
