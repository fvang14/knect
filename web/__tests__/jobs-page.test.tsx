import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobsClient } from "@/components/jobs/jobs-client";
import type { CustomerJobListItem } from "@/lib/types";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

const jobs: CustomerJobListItem[] = [
  {
    id: "job-1",
    contractor_id: "c1",
    contractor_display_name: "Sarah Khelka",
    status: "completed",
    description: "Fixed the drain",
    created_at: "2025-03-01T10:00:00Z",
    has_rating: false,
  },
  {
    id: "job-2",
    contractor_id: "c2",
    contractor_display_name: "Marcus Tate",
    status: "in_progress",
    description: "Panel upgrade",
    created_at: "2025-04-01T10:00:00Z",
    has_rating: false,
  },
];

test("renders My jobs heading", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByRole("heading", { name: /my jobs/i })).toBeInTheDocument();
});

test("renders all jobs by default", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
});

test("shows Leave a rating for completed unrated job", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByRole("link", { name: /leave a rating/i })).toBeInTheDocument();
});

test("Active filter shows only in_progress job", async () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  await userEvent.click(screen.getByRole("button", { name: /^active/i }));
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
  expect(screen.queryByText("Sarah Khelka")).not.toBeInTheDocument();
});

test("shows total spent when provided", () => {
  render(<JobsClient jobs={jobs} totalSpent={530} />);
  expect(screen.getByText(/530 spent/)).toBeInTheDocument();
});
