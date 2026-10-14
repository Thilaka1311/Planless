import React, { Component, ErrorInfo } from "react";
import { PlansDetailsScreen, PlansDetailsScreenProps } from "../../../features/plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen";
import { PlansPreviewScreen as HomePlansPreviewScreen } from "../../../features/home/screens/HomePlansPreview/HomePlansPreviewScreen";

interface DetailedPlanModalProps extends Omit<PlansDetailsScreenProps, "planId"> {
  planId: string | null;
  activeTab?: string;
}

interface ModalErrorBoundaryProps {
  planId: string | null;
  onClose?: () => void;
  children: React.ReactNode;
}

interface ModalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ModalErrorBoundary extends Component<ModalErrorBoundaryProps, ModalErrorBoundaryState> {
  public state: ModalErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ModalErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[DetailedPlanModal] Failed to render plan modal:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: ModalErrorBoundaryProps) {
    if (prevProps.planId !== this.props.planId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col items-center text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-[#ff5e3a] mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Unable to load plan</h3>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              This plan could not be displayed or is no longer available.
            </p>
            {this.props.onClose && (
              <button
                type="button"
                onClick={this.props.onClose}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-all border border-zinc-700 cursor-pointer active:scale-[0.98]"
              >
                Close
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DetailedPlanModal({ planId, activeTab, ...rest }: DetailedPlanModalProps) {
  if (!planId) return null;
  return (
    <ModalErrorBoundary planId={planId} onClose={rest.onClose}>
      {activeTab === "home" ? (
        <HomePlansPreviewScreen planId={planId} {...rest} />
      ) : (
        <PlansDetailsScreen planId={planId} {...rest} />
      )}
    </ModalErrorBoundary>
  );
}

export default React.memo(DetailedPlanModal);
