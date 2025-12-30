import '#/Style/components/TestPathLink.scss';

import { ExternalLink, FileText } from 'lucide-preact';
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

// Get GitHub URL for a test
function getGitHubUrl(path: string): string {
    const cleanPath = stripPathPrefix(path);
    return `https://github.com/tc39/test262/blob/main/test/${cleanPath}`;
}

// Get navigation path for the test view
function getTestViewPath(path: string): string {
    const cleanPath = stripPathPrefix(path);
    return `#/v/${cleanPath}`;
}

export function TestPathLink({ path, status, message, showActions = true, variant = 'default' }: TestPathLinkProps) {
    const cleanPath = stripPathPrefix(path);
    const testViewPath = getTestViewPath(path);
    const githubUrl = getGitHubUrl(path);
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
    
    const handleGitHubClick = (e: MouseEvent) => {
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
                        href={githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="action-btn github-btn"
                        onClick={handleGitHubClick}
                        title="View on GitHub"
                    >
                        <ExternalLink size={isSmall ? 12 : 14} />
                    </a>
                </div>
            )}
        </div>
    );
}
