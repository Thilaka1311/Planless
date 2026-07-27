import React from "react";
import { PlansDetailsScreen, PlansDetailsScreenProps } from "../../../features/plans/screens/PlansScreen/PlansPreviewScreen";
import { PlansPreviewScreen as HomePlansPreviewScreen } from "../../../features/home/screens/HomePlansPreview/HomePlansPreviewScreen";

interface DetailedPlanModalProps extends Omit<PlansDetailsScreenProps, "planId"> {
  planId: string | null;
  activeTab?: string;
}

function DetailedPlanModal({ planId, activeTab, ...rest }: DetailedPlanModalProps) {
  if (!planId) return null;
  if (activeTab === "home") {
    return <HomePlansPreviewScreen planId={planId} {...rest} />;
  }
  return <PlansDetailsScreen planId={planId} {...rest} />;
}

export default React.memo(DetailedPlanModal);

