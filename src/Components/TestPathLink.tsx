import '#/Style/components/TestPathLink.scss';

import { ExternalLink, FileText } from 'lucide-preact';
import { getTestFileUrl } from '#/Config';
import { openTestOutputModal } from './TestOutputModal';

export interface TestPathLinkProps {
    path: string;
    status?: string;
    message?: string;
    showActions?: boolean;
    variant?: 'default' | 'compact' | 'inline';
}

// Strip common path prefixes for cleaner display
function stripPathPrefix(path: string): string {
    const prefixes = [
        '../../test262/test/',
        '../test262/test/',
        'test262/test/',
        'test/',
    ];
    for (const prefix of prefixes) {
        if (path.startsWith(prefix)) {
            return path.slice(prefix.length);
        }
    }
    return path;
}

// Get configured external URL for a test
function getExternalTestUrl(path: string): string {
    const cleanPath = stripPathPrefix(path);
    return getTestFileUrl(cleanPath);
}

// Get navigation path for the test view
function getTestViewPath(path: string): string {
    const cleanPath = stripPathPrefix(path);
    return `#/v/${cleanPath}`;
}

export function TestPathLink({ path, status, message, showActions = true, variant = 'default' }: TestPathLinkProps) {
    const cleanPath = stripPathPrefix(path);
    const testViewPath = getTestViewPath(path);
    const externalTestUrl = getExternalTestUrl(path);
    const isSmall = variant === 'compact' || variant === 'inline';
    
    const handleClick = (e: MouseEvent) => {
        // Don't navigate if clicking on action buttons
        if ((e.target as HTMLElement).closest('.action-btn')) {
            return;
        }
        e.preventDefault();
        window.location.hash = testViewPath;
    };
    
    const handleOutputClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openTestOutputModal(path, status || 'UNKNOWN', message);
    };
    
    const handleExternalLinkClick = (e: MouseEvent) => {
        e.stopPropagation();
        // Let the link work normally
    };
    
    const className = variant === 'default' ? 'TestPathLink' : `TestPathLink ${variant}`;
    
    return (
        <div class={className} onClick={handleClick}>
            <a href={testViewPath} class="path-text unstyled" onClick={(e) => e.preventDefault()}>
                {cleanPath}
            </a>
            
            {showActions && (
                <div class="actions">
                    {(status && message !== undefined) && (
                        <button 
                            type="button" 
                            class="action-btn output-btn"
                            onClick={handleOutputClick}
                            title="View test output"
                        >
                            <FileText size={isSmall ? 12 : 14} />
                        </button>
                    )}
                    <a 
                        href={externalTestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="action-btn github-btn"
                        onClick={handleExternalLinkClick}
                        title="Open test file"
                    >
                        <ExternalLink size={isSmall ? 12 : 14} />
                    </a>
                </div>
            )}
        </div>
    );
}
