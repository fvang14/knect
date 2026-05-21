import { render, screen } from "@testing-library/react";
import { JobStatusPanel } from "@/components/panels/job-status-panel";

jest.mock("@/components/providers/providers", () => ({
  useJob: jest.fn(),
}));
jest.mock("@/lib/api-client", () => ({
  api: {
    getJob: jest.fn().mockResolvedValue(null),
    cancelJob: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/components/panels/rating-panel", () => ({
  RatingPanel: () => <div data-testid="rating-panel" />,
}));

import { useJob } from "@/components/providers/providers";

beforeEach(() => jest.clearAllMocks());

test("renders nothing when no active job", () => {
  (useJob as jest.Mock).mockReturnValue({ activeJob: null, setActiveJob: jest.fn() });
  const { container } = render(<JobStatusPanel />);
  expect(container).toBeEmptyDOMElement();
});

test("shows waiting title for pending status", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByText(/waiting for contractor/i)).toBeInTheDocument();
});

test("shows accepted title for accepted status", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "accepted", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByText(/on their way/i)).toBeInTheDocument();
});

test("shows Cancel Request button for pending", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByRole("button", { name: /cancel request/i })).toBeInTheDocument();
});

test("is positioned fixed bottom-right", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  const panel = screen.getByRole("complementary");
  expect(panel).toHaveClass("fixed");
});
