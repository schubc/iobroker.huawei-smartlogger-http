// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            adress: string;
            username: string;
            password: string;
            interval: number;
            para1: number;
            para2: number;
            items: object;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};