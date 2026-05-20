import { render, screen } from "@testing-library/react";
import { Rating } from "@/components/ui/rating";

test("renders numeric value", () => {
  render(<Rating value={4.9} count={52} />);
  expect(screen.getByText("4.9")).toBeInTheDocument();
});

test("renders count in parentheses", () => {
  render(<Rating value={4.9} count={52} />);
  expect(screen.getByText("(52)")).toBeInTheDocument();
});

test("hides count when showCount is false", () => {
  render(<Rating value={4.9} count={52} showCount={false} />);
  expect(screen.queryByText("(52)")).not.toBeInTheDocument();
});
