import { render, screen } from "@testing-library/react";
import { TradeChip } from "@/components/ui/trade-chip";

test("renders plumbing label", () => {
  render(<TradeChip trade="plumbing" />);
  expect(screen.getByText("Plumbing")).toBeInTheDocument();
});

test("renders electrical label", () => {
  render(<TradeChip trade="electrical" />);
  expect(screen.getByText("Electrical")).toBeInTheDocument();
});

test("returns null for unknown trade", () => {
  const { container } = render(<TradeChip trade="unknown" />);
  expect(container).toBeEmptyDOMElement();
});
