/**
 * Data Providers Auto-Discovery Index
 * 
 * This file imports all data providers, triggering their self-registration.
 * Adding a new provider only requires:
 * 1. Creating a new file in DataProviders/ that implements DataProvider
 * 2. Adding an import statement here
 * 
 * The provider will automatically:
 * - Register itself with the registry
 * - Become available in the UI
 * - Work with all data fetching operations
 */

// Import all providers - they self-register on import
import './GitHubProvider';
import './LocalProvider';
import './BoaProvider';
import './KieselProvider';
import './Test262FyiProvider';
import './LibJSProvider';

// Re-export registry and types for convenience
export { providerRegistry } from './registry';
export type {
    DataProvider,
    DataProviderFactory,
    DataProviderRegistryEntry,
    ProviderOptions,
    ProviderCapabilities,
    ProviderOptionDefinition,
    CompactTestEntry,
    TestDetails,
    DataSourceMetadata,
    DataSourceDefaultConfig,
    IconComponent,
} from './types';
