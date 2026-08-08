import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";

interface WalletState {
  dbWalletTransactions: any[];
  dbPlansLocal: any[];
  dbCirclesLocal: any[];
  dbPlanParticipantsLocal: any[];
  refreshTransactions: () => Promise<void>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider = ({
  children,
  userId = ""
}: {
  children: ReactNode;
  userId?: string;
}) => {
  const [hasLoaded, setHasLoaded] = useState(false);
  const { activeUserUuid } = useProfileStore();

  const [dbWalletTransactions, setDbWalletTransactions] = useState<any[]>([]);
  const [dbPlansLocal, setDbPlansLocal] = useState<any[]>([]);
  const [dbCirclesLocal, setDbCirclesLocal] = useState<any[]>([]);
  const [dbPlanParticipantsLocal, setDbPlanParticipantsLocal] = useState<any[]>([]);

  const refreshTransactions = useCallback(async () => {
    // Wallet feature disabled until built: no database requests to wallet_expenses
    setDbWalletTransactions([]);
    setHasLoaded(true);
  }, []);

  const contextValue = useMemo(() => ({
    dbWalletTransactions,
    dbPlansLocal,
    dbCirclesLocal,
    dbPlanParticipantsLocal,
    refreshTransactions
  }), [
    dbWalletTransactions, dbPlansLocal, dbCirclesLocal, dbPlanParticipantsLocal, refreshTransactions
  ]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWalletStore = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletStore must be used within a WalletProvider");
  }
  return context;
};
