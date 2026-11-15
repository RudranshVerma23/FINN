import { AlertsInbox } from "@/components/alerts-inbox";
import { getAlertInputs } from "@/lib/data";

export const metadata = { title: "Alerts · FINN" };

// Triggered alerts with thresholds the investor sets (FR-09).
export default function AlertsPage() {
  const d = getAlertInputs();
  return (
    <AlertsInbox
      bars={d.bars}
      filings={d.filings}
      companies={d.companies}
      defaults={d.defaults}
      categoryOptions={d.categoryOptions}
      now={d.now}
    />
  );
}
