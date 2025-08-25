
class FPLAnalyzer {
    constructor() {
        this.arsenalPlayers = new Set();
        this.allPlayers = {};
        this.leagueName = '';
        this.isProcessing = false;
        this.currentGameweek = null;
        
        this.ui = new UIController();
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadCurrentGameweek();
        this.initMobileLayout();
    }
    
    bindEvents() {
        document.getElementById('fplForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.analyzeLeague();
        });
        
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            const content = document.getElementById('sidebarContent');
            const arrow = document.querySelector('.toggle-arrow');
            content.classList.toggle('show');
            if (content.classList.contains('show')) {
                arrow.style.transform = 'rotate(180deg)';
            } else {
                arrow.style.transform = 'rotate(0deg)';
            }
            this.updateMobileLayout();
            setTimeout(() => this.adjustMobileLayout(), 400);
        });
        window.addEventListener('resize', () => {
            this.adjustMobileLayout();
        });
    }
    
    initMobileLayout() {
        if (window.innerWidth <= 1023) {
            const hasResults = document.getElementById('resultsSection').style.display === 'block';
            if (!hasResults) {
                const content = document.getElementById('sidebarContent');
                const arrow = document.querySelector('.toggle-arrow');
                content.classList.add('show');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            }
        }
        this.adjustMobileLayout();
    }
    
    adjustMobileLayout() {
        if (window.innerWidth <= 767) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                const sidebarHeight = sidebar.offsetHeight;
                document.documentElement.style.setProperty('--mobile-header-height', `${sidebarHeight}px`);
            }
        }
    }
    
    updateMobileLayout() {
        if (window.innerWidth <= 1023) {
            const sidebar = document.querySelector('.sidebar');
            const sidebarContent = document.getElementById('sidebarContent');
            
            if (sidebar && sidebarContent) {
                let expectedHeight;
                if (sidebarContent.classList.contains('show')) {
                    const sidebarClone = sidebar.cloneNode(true);
                    sidebarClone.style.position = 'absolute';
                    sidebarClone.style.visibility = 'hidden';
                    sidebarClone.style.height = 'auto';
                    sidebarClone.querySelector('.sidebar-content').style.maxHeight = 'none';
                    sidebarClone.querySelector('.sidebar-content').style.opacity = '1';
                    document.body.appendChild(sidebarClone);
                    expectedHeight = sidebarClone.offsetHeight;
                    document.body.removeChild(sidebarClone);
                } else {
                    const sidebarClone = sidebar.cloneNode(true);
                    sidebarClone.style.position = 'absolute';
                    sidebarClone.style.visibility = 'hidden';
                    sidebarClone.querySelector('.sidebar-content').style.maxHeight = '0';
                    sidebarClone.querySelector('.sidebar-content').style.opacity = '0';
                    document.body.appendChild(sidebarClone);
                    expectedHeight = sidebarClone.offsetHeight;
                    document.body.removeChild(sidebarClone);
                }
                
                document.documentElement.style.setProperty('--mobile-header-height', `${expectedHeight}px`);
            }
        }
    }

    /**
     * API Communication - using local proxy only
     */
    async fetchData(url) {
        const localUrl = url.replace('https://fantasy.premierleague.com/api', '/api/fpl');
        
        const response = await fetch(localUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Load master data and identify Arsenal players
     */
    async loadMasterData() {
        const url = FPLConfig.api.baseUrl + FPLConfig.api.endpoints.bootstrap;
        const data = await this.fetchData(url);
        
        this.dataUpdatedAt = `Fetched ${new Date().toLocaleString()} local time`;
        
        if (!this.currentGameweek && data.events) {
            const currentEvent = data.events.find(event => event.is_current);
            if (currentEvent) {
                this.currentGameweek = currentEvent.id;
            } else {
                const finishedEvents = data.events.filter(event => event.finished);
                if (finishedEvents.length > 0) {
                    this.currentGameweek = Math.max(...finishedEvents.map(e => e.id));
                }
            }
        }
        
        this.arsenalPlayers.clear();
        this.allPlayers = {};
        data.elements.forEach(player => {
            this.allPlayers[player.id] = {
                name: player.web_name,
                team: player.team,
                position: player.element_type,
                price: player.now_cost / 10
            };
            
            if (player.team === FPLConfig.ARSENAL_TEAM_ID) {
                this.arsenalPlayers.add(player.id);
            }
        });
        
        return data;
    }

    /**
     * Fetch league teams with smart pagination
     */
    async getLeagueTeams(leagueId) {
        let allTeams = [];
        let page = 1;
        const EXPECTED_PAGE_SIZE = 50;
        
        while (page <= 20) { // Safety limit
            const url = FPLConfig.api.baseUrl + 
                FPLConfig.api.endpoints.leagueStandings
                    .replace('{leagueId}', leagueId) + 
                `?page_new_entries=1&page_standings=${page}&phase=1`;
            
            const data = await this.fetchData(url);
            
            // Get league name from first page
            if (page === 1 && data.league && data.league.name) {
                this.leagueName = data.league.name;
            }
            
            if (!data.standings || !data.standings.results || data.standings.results.length === 0) {
                break;
            }
            
            const pageResults = data.standings.results;
            allTeams = allTeams.concat(pageResults);
            
            
            // Primary check: use has_next flag from API
            if (data.standings.has_next === false) {
                break;
            }
            
            // Fallback: detect last page by size (only if has_next is missing)
            if (data.standings.has_next === undefined && pageResults.length < EXPECTED_PAGE_SIZE) {
                break;
            }
            
            page++;
        }
        
        return allTeams;
    }

    /**
     * Check if player count meets requirements
     */
    checkPlayerCount(count, requirement) {
        if (!requirement.enabled) return true;
        
        switch (requirement.operator) {
            case "exactly":
                return count === requirement.count;
            case "minimum":
                return count >= requirement.count;
            case "maximum":
                return count <= requirement.count;
            default:
                return false;
        }
    }

    /**
     * Check team compliance against Arsenal rules
     */
    async checkTeamCompliance(entryId, gameweek, config) {
        const url = FPLConfig.api.baseUrl + 
            FPLConfig.api.endpoints.teamPicks
                .replace('{entryId}', entryId)
                .replace('{gameweek}', gameweek);
        
        try {
            const data = await this.fetchData(url);
            
            let arsenalInStartingXI = 0;
            let arsenalPlayerNames = [];
            let captainIsArsenal = false;
            let viceCaptainIsArsenal = false;
            let captainName = '';
            let viceCaptainName = '';
            
            data.picks.forEach(pick => {
                const isArsenalPlayer = this.arsenalPlayers.has(pick.element);
                
                // Check if in starting XI (multiplier > 0)
                if (pick.multiplier > 0 && isArsenalPlayer) {
                    arsenalInStartingXI++;
                    arsenalPlayerNames.push(this.allPlayers[pick.element]?.name || 'Unknown');
                }
                
                // Check captain
                if (pick.is_captain) {
                    captainIsArsenal = isArsenalPlayer;
                    captainName = this.allPlayers[pick.element]?.name || 'Unknown';
                }
                
                // Check vice-captain
                if (pick.is_vice_captain) {
                    viceCaptainIsArsenal = isArsenalPlayer;
                    viceCaptainName = this.allPlayers[pick.element]?.name || 'Unknown';
                }
            });
            
            // Evaluate Arsenal rules
            const playerCountPass = this.checkPlayerCount(arsenalInStartingXI, config.arsenal.playersInStartingXI);
            const captainPass = !config.arsenal.captain.enabled || !config.arsenal.captain.mustBeArsenal || captainIsArsenal;
            const viceCaptainPass = !config.arsenal.viceCaptain.enabled || !config.arsenal.viceCaptain.mustBeArsenal || viceCaptainIsArsenal;
            
            const allRulesPassed = playerCountPass && captainPass && viceCaptainPass;
            
            return {
                arsenalInStartingXI,
                arsenalPlayerNames,
                captainName,
                viceCaptainName,
                captainIsArsenal,
                viceCaptainIsArsenal,
                checks: {
                    playerCount: playerCountPass,
                    captain: captainPass,
                    viceCaptain: viceCaptainPass
                },
                allRulesPassed
            };
            
        } catch (error) {
            console.error(`Error checking team ${entryId}:`, error.message);
            return null;
        }
    }

    /**
     * Main analysis process
     */
    async processLeague(config) {
        try {
            this.ui.updateProgress(10, 'Loading master data...');
            
            // Load master data
            await this.loadMasterData();
            
            this.ui.updateProgress(20, 'Fetching league teams...');
            
            // Get league teams
            const teams = await this.getLeagueTeams(config.league.id);
            
            this.ui.updateProgress(30, `Processing ${teams.length} teams...`);
            
            
            const results = [];
            const batchSize = FPLConfig.api.batchSize;
            
            // Process teams in batches
            for (let i = 0; i < teams.length; i += batchSize) {
                const batch = teams.slice(i, Math.min(i + batchSize, teams.length));
                const batchPromises = batch.map(team => 
                    this.checkTeamCompliance(team.entry, config.league.gameweek, config).then(checkResult => 
                        checkResult ? { ...team, ...checkResult } : null
                    )
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults.filter(r => r !== null));
                
                // Update progress
                const progress = 30 + Math.floor((i + batchSize) / teams.length * 60);
                this.ui.updateProgress(progress, `Processed ${Math.min(i + batchSize, teams.length)}/${teams.length} teams...`);
                
                // Delay between batches
                if (FPLConfig.api.requestDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, FPLConfig.api.requestDelay));
                }
            }
            
            this.ui.updateProgress(100, 'Analysis complete!');
            
            // Display results
            this.ui.displayResults(results, config, this.leagueName, this.dataUpdatedAt);
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            this.ui.showError(error.message);
        }
    }

    /**
     * Load current gameweek
     */
    async loadCurrentGameweek() {
        try {
            await this.loadMasterData();
            // Current gameweek is now set in loadMasterData
        } catch (error) {
            console.error('Failed to load current gameweek:', error);
            // Default to gameweek 1 if there's an error
            this.currentGameweek = 1;
        }
    }
    
    /**
     * Handle form submission and start analysis
     */
    async analyzeLeague() {
        if (this.isProcessing) return;
        
        const formData = this.getFormData();
        if (!formData) return;
        
        // Collapse sidebar on mobile when starting analysis
        if (window.innerWidth <= 1023) {
            const content = document.getElementById('sidebarContent');
            const arrow = document.querySelector('.toggle-arrow');
            if (content && content.classList.contains('show')) {
                content.classList.remove('show');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                // Update mobile layout after collapsing
                setTimeout(() => this.updateMobileLayout(), 100);
            }
        }
        
        this.isProcessing = true;
        this.ui.showProgress();
        
        try {
            await this.processLeague(formData);
        } catch (error) {
            console.error('Analysis failed:', error);
            this.ui.showError(error.message);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Export report using CLI
     */
    async exportReport() {
        if (this.isProcessing) return;
        
        const formData = this.getFormData();
        if (!formData) return;
        
        this.isProcessing = true;
        this.ui.showProgress();
        this.ui.updateProgress(0, 'Preparing export...');
        
        try {
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    leagueId: formData.league.id,
                    rules: {
                        playersRule: formData.arsenal.playersInStartingXI.enabled,
                        playersCount: formData.arsenal.playersInStartingXI.count,
                        playersOperator: formData.arsenal.playersInStartingXI.operator,
                        captainRule: formData.arsenal.captain.enabled,
                        viceCaptainRule: formData.arsenal.viceCaptain.enabled
                    }
                })
            });
            
            this.ui.updateProgress(50, 'Running analysis...');
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            this.ui.updateProgress(100, 'Download ready!');
            
            if (result.success) {
                // Create download link
                const blob = new Blob([result.content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                setTimeout(() => {
                    this.ui.hideProgress();
                }, 1000);
            } else {
                throw new Error(result.error || 'Export failed');
            }
            
        } catch (error) {
            console.error('Export failed:', error);
            this.ui.showError(`Export failed: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Get and validate form data
     */
    getFormData() {
        // Sanitize and validate league ID
        const leagueIdInput = document.getElementById('leagueId').value.trim();
        const leagueId = parseInt(leagueIdInput);
        
        if (!leagueIdInput || isNaN(leagueId) || leagueId < 1 || leagueId > 999999999) {
            this.ui.showError('Please enter a valid League ID (1-999999999)');
            return null;
        }
        
        if (!this.currentGameweek) {
            this.ui.showError('Unable to determine current gameweek. Please refresh and try again.');
            return null;
        }
        
        // Validate player count input
        const playersCountInput = document.getElementById('playersCount').value;
        const playersCount = parseInt(playersCountInput);
        
        if (isNaN(playersCount) || playersCount < 0 || playersCount > 11) {
            this.ui.showError('Player count must be between 0 and 11');
            return null;
        }
        
        // Validate operator selection
        const playersOperator = document.getElementById('playersOperator').value;
        const validOperators = ['minimum', 'exactly', 'maximum'];
        if (!validOperators.includes(playersOperator)) {
            this.ui.showError('Invalid operator selected');
            return null;
        }
        
        return {
            league: {
                id: leagueId,
                gameweek: this.currentGameweek
            },
            arsenal: {
                playersInStartingXI: {
                    enabled: document.getElementById('playersRule').checked,
                    count: parseInt(document.getElementById('playersCount').value),
                    operator: document.getElementById('playersOperator').value
                },
                captain: {
                    enabled: document.getElementById('captainRule').checked,
                    mustBeArsenal: true
                },
                viceCaptain: {
                    enabled: document.getElementById('viceCaptainRule').checked,
                    mustBeArsenal: true
                }
            }
        };
    }
}

/**
 * UI Controller - manages all UI interactions
 */
class UIController {
    constructor() {
        this.elements = {
            progressSection: document.getElementById('progressSection'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            errorSection: document.getElementById('errorSection'),
            errorMessage: document.getElementById('errorMessage'),
            resultsSection: document.getElementById('resultsSection'),
            checkBtn: document.getElementById('checkBtn'),
            exportBtn: document.getElementById('exportBtn') || null // May not exist
        };
        
        this.currentFilter = 'all';
        this.allResults = [];
    }
    
    showProgress() {
        this.hideAllSections();
        this.elements.progressSection.style.display = 'block';
        this.elements.checkBtn.disabled = true;
        if (this.elements.exportBtn) this.elements.exportBtn.disabled = true;
        this.hideEmptyState();
    }
    
    hideProgress() {
        this.elements.progressSection.style.display = 'none';
        this.elements.checkBtn.disabled = false;
        
        // Recalculate mobile layout when progress disappears
        if (window.checker && window.checker.updateMobileLayout) {
            setTimeout(() => window.checker.updateMobileLayout(), 100);
        }
    }
    
    enableExport() {
        if (this.elements.exportBtn) this.elements.exportBtn.disabled = false;
    }
    
    updateProgress(percent, text) {
        this.elements.progressFill.style.width = percent + '%';
        this.elements.progressText.textContent = text;
    }
    
    showError(message) {
        this.hideAllSections();
        this.elements.errorMessage.textContent = message;
        this.elements.errorSection.style.display = 'block';
        this.elements.checkBtn.disabled = false;
        this.hideEmptyState();
        
        // Keep sidebar open on mobile/tablet when showing error
        if (window.innerWidth <= 1023) {
            const content = document.getElementById('sidebarContent');
            const arrow = document.querySelector('.toggle-arrow');
            content.classList.add('show');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
            setTimeout(() => {
                if (typeof app !== 'undefined' && app.adjustMobileLayout) {
                    app.adjustMobileLayout();
                }
            }, 300);
        }
    }
    
    hideAllSections() {
        this.elements.progressSection.style.display = 'none';
        this.elements.errorSection.style.display = 'none';
    }
    
    displayResults(results, config, leagueName, dataUpdatedAt) {
        this.allResults = results;
        this.config = config;
        this.leagueName = leagueName;
        this.dataUpdatedAt = dataUpdatedAt;
        
        const compliant = results.filter(r => r.allRulesPassed);
        const nonCompliant = results.filter(r => !r.allRulesPassed);
        
        const html = this.generateResultsHTML(results, compliant, nonCompliant, config, leagueName, dataUpdatedAt);
        
        this.elements.resultsSection.innerHTML = html;
        this.bindFilterEvents();
        this.hideProgress();
        this.hideEmptyState();
        this.enableExport();
        
        // Auto-collapse sidebar on mobile/tablet when showing results
        if (window.innerWidth <= 1023) {
            const content = document.getElementById('sidebarContent');
            const arrow = document.querySelector('.toggle-arrow');
            content.classList.remove('show');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            // Recalculate layout after collapse
            setTimeout(() => {
                if (typeof app !== 'undefined' && app.adjustMobileLayout) {
                    app.adjustMobileLayout();
                }
            }, 300);
        }
    }
    
    hideEmptyState() {
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }
    
    generateResultsHTML(results, compliant, nonCompliant, config, leagueName, dataUpdatedAt) {
        return `
            <div class="results-header">
                <h2>📊 ${leagueName} Analysis</h2>
                <p>Gameweek ${config.league.gameweek} (Current) • ${results.length} teams analyzed</p>
                ${dataUpdatedAt ? `<p class="data-updated">${dataUpdatedAt}</p>` : ''}
                ${this.getActiveRulesText(config)}
            </div>
            
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-number">${results.length}</div>
                    <div class="summary-label">Total Teams</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: var(--success);">${compliant.length}</div>
                    <div class="summary-label">Compliant</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: var(--error);">${nonCompliant.length}</div>
                    <div class="summary-label">Non-Compliant</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${Math.round(compliant.length / results.length * 100)}%</div>
                    <div class="summary-label">Compliance Rate</div>
                </div>
            </div>
            
            <div class="table-section">
                <div class="filter-section-sticky">
                    <div class="filter-section">
                        <div class="filter-header">
                            <h3 class="filter-title" id="filterTitle">📊 All Teams (${results.length})</h3>
                            <div class="search-box">
                                <input type="text" id="tableSearch" placeholder="🔍 Search teams or managers..." class="table-search-input">
                            </div>
                        </div>
                        <div class="filter-controls">
                            <button class="filter-btn active" data-filter="all">All (${results.length})</button>
                            <button class="filter-btn success" data-filter="compliant">✅ Compliant (${compliant.length})</button>
                            <button class="filter-btn error" data-filter="non-compliant">❌ Non-Compliant (${nonCompliant.length})</button>
                        </div>
                    </div>
                </div>
                
                ${this.generateSingleTable(results, config)}
            </div>
        `;
    }
    
    generateSingleTable(results, config) {
        const sortedResults = results.sort((a, b) => a.rank - b.rank);
        
        const playersRule = config.arsenal.playersInStartingXI.enabled;
        const captainRule = config.arsenal.captain.enabled;
        const viceCaptainRule = config.arsenal.viceCaptain.enabled;
        
        let headers = '<th>Rank</th><th>Manager</th><th>Team Name</th>';
        
        if (playersRule) {
            const operator = config.arsenal.playersInStartingXI.operator;
            const count = config.arsenal.playersInStartingXI.count;
            let requirementText = '';
            if (operator === 'minimum') requirementText = `Min ${count}`;
            else if (operator === 'exactly') requirementText = `Exactly ${count}`;
            else if (operator === 'maximum') requirementText = `Max ${count}`;
            headers += `<th>Arsenal Players<br><small>${requirementText}</small></th>`;
        }
        
        if (captainRule) {
            headers += '<th>Captain<br><small>Must be Arsenal</small></th>';
        }
        
        if (viceCaptainRule) {
            headers += '<th>Vice-Captain<br><small>Must be Arsenal</small></th>';
        }
        
        if (playersRule || captainRule || viceCaptainRule) {
            headers += '<th>Status</th><th>Issues</th>';
        } else {
            headers += '<th>Note</th>';
        }
        
        let html = `
            <div class="table-container">
                <table class="results-table">
                    <thead>
                        <tr>${headers}</tr>
                    </thead>
                    <tbody id="resultsTableBody">
        `;
        
        sortedResults.forEach(team => {
            const complianceClass = team.allRulesPassed ? 'compliant' : 'non-compliant';
            
            let rowData = `
                <tr class="${complianceClass}" data-compliance="${team.allRulesPassed ? 'compliant' : 'non-compliant'}">
                    <td><strong>${team.rank}</strong></td>
                    <td>${team.player_name}</td>
                    <td><strong>${team.entry_name}</strong></td>`;
            
            if (playersRule) {
                rowData += `
                    <td>
                        <span class="badge ${team.checks.playerCount ? 'badge-success' : 'badge-error'}">${team.arsenalInStartingXI}</span>
                        ${team.arsenalPlayerNames.length > 0 ? 
                            `<div class="player-list">${team.arsenalPlayerNames.join(', ')}</div>` : ''}
                    </td>`;
            }
            
            if (captainRule) {
                rowData += `
                    <td>${team.captainName} 
                        <span class="icon-badge ${team.captainIsArsenal ? 'icon-badge-success' : 'icon-badge-error'}">
                            ${team.captainIsArsenal ? '✓' : '✗'}
                        </span>
                    </td>`;
            }
            
            if (viceCaptainRule) {
                rowData += `
                    <td>${team.viceCaptainName}
                        <span class="icon-badge ${team.viceCaptainIsArsenal ? 'icon-badge-success' : 'icon-badge-error'}">
                            ${team.viceCaptainIsArsenal ? '✓' : '✗'}
                        </span>
                    </td>`;
            }
            
            if (playersRule || captainRule || viceCaptainRule) {
                rowData += `
                    <td>
                        <span class="badge ${team.allRulesPassed ? 'badge-success' : 'badge-error'}">
                            ${team.allRulesPassed ? '✅ Compliant' : '❌ Non-Compliant'}
                        </span>
                    </td>`;
                rowData += '<td>';
            } else {
                rowData += `
                    <td>
                        <span class="badge badge-info">
                            No rules enabled
                        </span>
                    </td>`;
            }
            
            html += rowData;
            
            if (playersRule || captainRule || viceCaptainRule) {
                if (!team.allRulesPassed) {
                    let issues = [];
                    
                    if (playersRule && !team.checks.playerCount) {
                        const operator = config.arsenal.playersInStartingXI.operator;
                        const count = config.arsenal.playersInStartingXI.count;
                        let issueText = '';
                        if (operator === 'minimum') issueText = `Only ${team.arsenalInStartingXI}/${count} Arsenal players`;
                        else if (operator === 'exactly') issueText = `Has ${team.arsenalInStartingXI}, needs exactly ${count}`;
                        else if (operator === 'maximum') issueText = `Has ${team.arsenalInStartingXI}, max allowed ${count}`;
                        issues.push(issueText);
                    }
                    
                    if (captainRule && !team.checks.captain) {
                        issues.push('Non-Arsenal captain');
                    }
                    
                    if (viceCaptainRule && !team.checks.viceCaptain) {
                        issues.push('Non-Arsenal vice-captain');
                    }
                    
                    html += `<span class="badge badge-warning">${issues.join(', ')}</span>`;
                } else {
                    html += '-';
                }
                html += '</td>';
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
        return html;
    }
    
    getActiveRulesText(config) {
        const playersRule = config.arsenal.playersInStartingXI.enabled;
        const captainRule = config.arsenal.captain.enabled;
        const viceCaptainRule = config.arsenal.viceCaptain.enabled;
        
        let enabledRules = [];
        if (playersRule) {
            const operator = config.arsenal.playersInStartingXI.operator;
            const count = config.arsenal.playersInStartingXI.count;
            let ruleText = '';
            if (operator === 'minimum') ruleText = `Minimum ${count} Arsenal players`;
            else if (operator === 'exactly') ruleText = `Exactly ${count} Arsenal players`;
            else if (operator === 'maximum') ruleText = `Maximum ${count} Arsenal players`;
            enabledRules.push(ruleText);
        }
        if (captainRule) enabledRules.push('Captain must be Arsenal');
        if (viceCaptainRule) enabledRules.push('Vice-Captain must be Arsenal');
        
        return enabledRules.length > 0 
            ? `<div class="active-rules"><strong>Active Rules:</strong> ${enabledRules.join(' • ')}</div>`
            : '<div class="active-rules"><strong>No rules enabled</strong> - All teams will show as compliant</div>';
    }
    
    bindFilterEvents() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        const searchInput = document.getElementById('tableSearch');
        
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.applyFilter(filter);
                
                // Update active button
                filterButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Add search functionality
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTable(e.target.value);
            });
        }
    }
    
    applyFilter(filter) {
        this.currentFilter = filter;
        const searchInput = document.getElementById('tableSearch');
        const searchTerm = searchInput ? searchInput.value : '';
        
        // Apply both filter and search
        this.updateTableDisplay(filter, searchTerm);
    }
    
    searchTable(searchTerm) {
        // Apply search with current filter
        this.updateTableDisplay(this.currentFilter, searchTerm);
    }
    
    updateTableDisplay(filter, searchTerm = '') {
        const rows = document.querySelectorAll('#resultsTableBody tr');
        const title = document.getElementById('filterTitle');
        const tableContainer = document.querySelector('.table-container');
        
        const compliant = this.allResults.filter(r => r.allRulesPassed);
        const nonCompliant = this.allResults.filter(r => !r.allRulesPassed);
        
        let visibleCount = 0;
        const search = searchTerm.toLowerCase();
        
        rows.forEach(row => {
            const compliance = row.dataset.compliance;
            let shouldShowByFilter = false;
            
            // Check filter
            switch(filter) {
                case 'all':
                    shouldShowByFilter = true;
                    break;
                case 'compliant':
                    shouldShowByFilter = compliance === 'compliant';
                    break;
                case 'non-compliant':
                    shouldShowByFilter = compliance === 'non-compliant';
                    break;
            }
            
            // Check search
            let shouldShowBySearch = true;
            if (search) {
                const rowText = row.textContent.toLowerCase();
                shouldShowBySearch = rowText.includes(search);
            }
            
            // Show only if both conditions are met
            if (shouldShowByFilter && shouldShowBySearch) {
                row.classList.remove('hidden');
                visibleCount++;
            } else {
                row.classList.add('hidden');
            }
        });
        
        // Show/hide empty message
        this.updateEmptyMessage(visibleCount, filter, search, tableContainer);
        
        // Update title with count
        let baseTitle = '';
        switch(filter) {
            case 'all':
                baseTitle = `📊 All Teams`;
                break;
            case 'compliant':
                baseTitle = `✅ Compliant Teams`;
                break;
            case 'non-compliant':
                baseTitle = `❌ Non-Compliant Teams`;
                break;
        }
        
        if (search) {
            title.innerHTML = `${baseTitle} (${visibleCount} found)`;
        } else {
            switch(filter) {
                case 'all':
                    title.innerHTML = `${baseTitle} (${this.allResults.length})`;
                    break;
                case 'compliant':
                    title.innerHTML = `${baseTitle} (${compliant.length})`;
                    break;
                case 'non-compliant':
                    title.innerHTML = `${baseTitle} (${nonCompliant.length})`;
                    break;
            }
        }
    }
    
    updateEmptyMessage(visibleCount, filter, search, container) {
        // Remove existing empty message if any
        const existingMessage = container.querySelector('.empty-results-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Get the table element
        const table = container.querySelector('.results-table');
        
        // Add empty message if no results
        if (visibleCount === 0 && container) {
            // Hide the table
            if (table) {
                table.style.display = 'none';
            }
            
            let message = '';
            if (search) {
                message = `
                    <div class="empty-results-message">
                        <div class="empty-icon">🔍</div>
                        <h3>No teams found</h3>
                        <p>No teams matching "${search}" in ${filter === 'all' ? 'all teams' : filter + ' teams'}</p>
                        <p class="empty-hint">Try adjusting your search or filter criteria</p>
                    </div>
                `;
            } else {
                switch(filter) {
                    case 'compliant':
                        message = `
                            <div class="empty-results-message">
                                <div class="empty-icon">😟</div>
                                <h3>No compliant teams</h3>
                                <p>No teams are following all the Arsenal rules</p>
                            </div>
                        `;
                        break;
                    case 'non-compliant':
                        message = `
                            <div class="empty-results-message">
                                <div class="empty-icon">🎉</div>
                                <h3>All teams are compliant!</h3>
                                <p>Every team is following the Arsenal rules</p>
                            </div>
                        `;
                        break;
                    default:
                        message = `
                            <div class="empty-results-message">
                                <div class="empty-icon">📭</div>
                                <h3>No teams to display</h3>
                            </div>
                        `;
                }
            }
            container.insertAdjacentHTML('afterbegin', message);
        } else {
            // Show the table when there are results
            if (table) {
                table.style.display = '';
            }
        }
    }
}

// Initialize the application when DOM is ready
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new FPLAnalyzer();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .catch(error => {});
    }
});