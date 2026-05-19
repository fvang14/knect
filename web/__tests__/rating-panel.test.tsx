import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingPanel } from "@/components/panels/rating-panel";

// Mock api-client
jest.mock("@/lib/api-client", () => ({
  api: {
    submitRating: jest.fn(),
  },
}));

import { api } from "@/lib/api-client";

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders 5 star buttons", () => {
  render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
  expect(screen.getAllByRole("button", { name: /star/i })).toHaveLength(5);
});

test("submit button is disabled until a star is selected", () => {
  render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
  expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
});

test("clicking a star enables the submit button", async () => {
  render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: /4 star/i }));
  expect(screen.getByRole("button", { name: /submit/i })).not.toBeDisabled();
});

test("submits correct score and calls onRated", async () => {
  (api.submitRating as jest.Mock).mockResolvedValueOnce(undefined);
  const onRated = jest.fn();
  render(<RatingPanel jobId="job-1" onRated={onRated} />);

  await userEvent.click(screen.getByRole("button", { name: /5 star/i }));
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(api.submitRating).toHaveBeenCalledWith("job-1", 5, undefined);
    expect(onRated).toHaveBeenCalled();
  });
});

test("submits score with optional review text", async () => {
  (api.submitRating as jest.Mock).mockResolvedValueOnce(undefined);
  render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: /3 star/i }));
  await userEvent.type(screen.getByRole("textbox"), "Great work!");
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(api.submitRating).toHaveBeenCalledWith("job-1", 3, "Great work!");
  });
});

test("shows error message on submit failure", async () => {
  (api.submitRating as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
  render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: /1 star/i }));
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(screen.getByText(/failed to submit/i)).toBeInTheDocument();
  });
});
