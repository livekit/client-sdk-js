export declare class SifGuard {
    private consecutiveSifCount;
    private sifSequenceStartedAt;
    private lastSifReceivedAt;
    private userFramesSinceSif;
    recordSif(): void;
    recordUserFrame(): void;
    isSifAllowed(): boolean;
    reset(): void;
}
//# sourceMappingURL=SifGuard.d.ts.map
