import '#/Style/components/TestOutputModal.scss';

import { signal } from '@preact/signals';
import { X, ExternalLink } from 'lucide-preact';
import { Code } from './Ui/Code';
import { Button } from './Ui/Button';

// State for the test output modal
export const testOutputModalOpen = signal(false);
export const testOutputData = signal<{
    path: string;
    status: string;
    message?: string;
} | null>(null);

export function openTestOutputModal(path: string, status: string, message?: string) {
    testOutputData.value = { path, status, message };
    testOutputModalOpen.value = true;
}

export function closeTestOutputModal() {
    testOutputModalOpen.value = false;
    testOutputData.value = null;
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

// Guess language for syntax highlighting
function guessLanguage(message?: string): 'javascript' | 'python' | null {
    if (!message) return null;
    if (message.includes('is not defined') || message.includes('Unhandled rejection:')) {
        return 'javascript';
    }
    if (message.includes('/usr/lib/python')) {
        return 'python';
    }
    return null;
}

// Get status color class
function getStatusClass(status: string): string {
    switch (status.toUpperCase()) {
        case 'PASS': return 'pass';
        case 'FAIL': return 'fail';
        case 'CRASH': return 'crash';
        case 'TIMEOUT': return 'timeout';
        case 'SKIP': return 'skip';
        default: return '';
    }
}

export function TestOutputModal() {
    const data = testOutputData.value;
    
    if (!testOutputModalOpen.value || !data) {
        return null;
    }
    
    const cleanPath = stripPathPrefix(data.path);
    const githubUrl = getGitHubUrl(data.path);
    const testViewPath = getTestViewPath(data.path);
    const language = guessLanguage(data.message);
    
    const handleViewDetails = () => {
        closeTestOutputModal();
        window.location.hash = testViewPath;
    };
    
    return (
        <div class="TestOutputModal-overlay" onClick={closeTestOutputModal}>
            <div class="TestOutputModal" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <div class="header-content">
                        <span class={`status-badge ${getStatusClass(data.status)}`}>
                            {data.status}
                        </span>
                        <h2>Test Output</h2>
                    </div>
                    <button 
                        type="button" 
                        class="close-btn" 
                        onClick={closeTestOutputModal}
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div class="modal-body">
                    <div class="test-path-section">
                        <code class="test-path">{cleanPath}</code>
                    </div>
                    
                    <div class="output-section">
                        <header>Output</header>
                        <div class="output-content">
                            {data.message ? (
                                <Code language={language} code={data.message} />
                            ) : (
                                <i class="no-output">No output message</i>
                            )}
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <Button color="primary" onClick={handleViewDetails}>
                        View Details
                    </Button>
                    <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="github-link">
                        <Button color="secondary" icon={ExternalLink}>
                            View on GitHub
                        </Button>
                    </a>
                    <Button color="secondary" onClick={closeTestOutputModal}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
