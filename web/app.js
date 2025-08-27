
class FPLAnalyzer {
    constructor() {
        this.arsenalPlayers = new Set();
        this.allPlayers = {};
        this.leagueName = '';
        this.isProcessing = false;
        this.currentGameweek = null;
        
        this.teamCache = new Map();
        this.cacheExpiry = 60 * 60 * 1000;
        
        this.failedTeams = [];
        this.baseRetryDelay = 5000;
        this.currentRetryDelay = 5000;
        this.shouldPauseImmediately = false;
        this.pauseRound = 0;
        
        this.ui = new UIController();
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadCurrentGameweek();
        this.loadFromURL();
    }
    
    bindEvents() {
        document.getElementById('fplForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.analyzeLeague();
        });
        
        // Add share button event listener
        document.getElementById('shareBtn').addEventListener('click', () => {
            this.shareURL();
        });
        
        // Add event listeners for form changes to update URL
        const formElements = [
            'leagueId', 'gameweekSelect', 'squadRule', 'squadCount', 'squadOperator',
            'playersRule', 'playersCount', 'playersOperator', 'captainRule', 'viceCaptainRule'
        ];
        
        formElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.updateURL();
                });
                element.addEventListener('input', () => {
                    this.updateURL();
                });
            }
        });
    }
    
    /**
     * Load form values from URL parameters
     */
    loadFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Load league ID
        const leagueId = urlParams.get('leagueId');
        if (leagueId) {
            document.getElementById('leagueId').value = leagueId;
        }
        
        // Load gameweek (will be set after loadCurrentGameweek completes)
        const gameweek = urlParams.get('gameweek');
        if (gameweek) {
            this.urlGameweek = parseInt(gameweek);
        }
        
        // Load squad rule
        const squadRule = urlParams.get('squadRule');
        if (squadRule !== null) {
            document.getElementById('squadRule').checked = squadRule === 'true';
        }
        
        const squadCount = urlParams.get('squadCount');
        if (squadCount) {
            document.getElementById('squadCount').value = squadCount;
        }
        
        const squadOperator = urlParams.get('squadOperator');
        if (squadOperator) {
            document.getElementById('squadOperator').value = squadOperator;
        }
        
        // Load players rule
        const playersRule = urlParams.get('playersRule');
        if (playersRule !== null) {
            document.getElementById('playersRule').checked = playersRule === 'true';
        }
        
        const playersCount = urlParams.get('playersCount');
        if (playersCount) {
            document.getElementById('playersCount').value = playersCount;
        }
        
        const playersOperator = urlParams.get('playersOperator');
        if (playersOperator) {
            document.getElementById('playersOperator').value = playersOperator;
        }
        
        // Load captain rule
        const captainRule = urlParams.get('captainRule');
        if (captainRule !== null) {
            document.getElementById('captainRule').checked = captainRule === 'true';
        }
        
        // Load vice captain rule
        const viceCaptainRule = urlParams.get('viceCaptainRule');
        if (viceCaptainRule !== null) {
            document.getElementById('viceCaptainRule').checked = viceCaptainRule === 'true';
        }
    }
    
    /**
     * Update URL with current form values
     */
    updateURL() {
        const formData = this.getFormDataForURL();
        if (formData) {
            const urlParams = new URLSearchParams();
            
            // Only add non-empty values to keep URL clean
            if (formData.league.id) urlParams.set('leagueId', formData.league.id);
            if (formData.league.gameweek) urlParams.set('gameweek', formData.league.gameweek);
            
            // Squad rules
            if (formData.arsenal.playersInSquad.enabled) {
                urlParams.set('squadRule', 'true');
                urlParams.set('squadCount', formData.arsenal.playersInSquad.count);
                urlParams.set('squadOperator', formData.arsenal.playersInSquad.operator);
            }
            
            // Players rules
            if (formData.arsenal.playersInStartingXI.enabled) {
                urlParams.set('playersRule', 'true');
                urlParams.set('playersCount', formData.arsenal.playersInStartingXI.count);
                urlParams.set('playersOperator', formData.arsenal.playersInStartingXI.operator);
            }
            
            // Captain rules
            if (formData.arsenal.captain.enabled) {
                urlParams.set('captainRule', 'true');
            }
            
            // Vice captain rules
            if (formData.arsenal.viceCaptain.enabled) {
                urlParams.set('viceCaptainRule', 'true');
            }
            
            // Update URL without reloading page
            const newURL = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', newURL);
        }
    }
    
    /**
     * Get form data for URL (similar to getFormData but without validation)
     */
    getFormDataForURL() {
        try {
            const leagueIdInput = document.getElementById('leagueId').value.trim();
            const leagueId = parseInt(leagueIdInput);
            const selectedGameweek = parseInt(document.getElementById('gameweekSelect').value);
            
            return {
                league: {
                    id: isNaN(leagueId) ? null : leagueId,
                    gameweek: isNaN(selectedGameweek) ? null : selectedGameweek
                },
                arsenal: {
                    playersInSquad: {
                        enabled: document.getElementById('squadRule').checked,
                        count: parseInt(document.getElementById('squadCount').value) || 0,
                        operator: document.getElementById('squadOperator').value || 'minimum'
                    },
                    playersInStartingXI: {
                        enabled: document.getElementById('playersRule').checked,
                        count: parseInt(document.getElementById('playersCount').value) || 0,
                        operator: document.getElementById('playersOperator').value || 'minimum'
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
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Share current configuration via URL
     */
    async shareURL() {
        // Update URL first to ensure it's current
        this.updateURL();
        
        const shareBtn = document.getElementById('shareBtn');
        const originalText = shareBtn.innerHTML;
        
        try {
            // Copy to clipboard
            await navigator.clipboard.writeText(window.location.href);
            
            // Show success feedback
            shareBtn.innerHTML = '<span aria-hidden="true">✅</span> URL Copied!';
            shareBtn.style.background = '#28a745';
            shareBtn.style.color = 'white';
            
            setTimeout(() => {
                shareBtn.innerHTML = originalText;
                shareBtn.style.background = '';
                shareBtn.style.color = '';
            }, 2500);
            
        } catch (error) {
            console.error('Error copying URL:', error);
            
            // Show error feedback
            shareBtn.innerHTML = '<span aria-hidden="true">❌</span> Copy Failed';
            shareBtn.style.background = '#dc3545';
            shareBtn.style.color = 'white';
            
            setTimeout(() => {
                shareBtn.innerHTML = originalText;
                shareBtn.style.background = '';
                shareBtn.style.color = '';
            }, 2500);
        }
    }
    
    /**
     * Populate gameweek dropdown with available gameweeks
     */
    populateGameweekDropdown(events, currentGameweek) {
        const select = document.getElementById('gameweekSelect');
        select.innerHTML = '';
        
        if (events && events.length > 0) {
            // Add gameweeks from 1 to current gameweek
            for (let gw = 1; gw <= currentGameweek; gw++) {
                const option = document.createElement('option');
                option.value = gw;
                option.textContent = `Gameweek ${gw}`;
                
                // Check if this gameweek should be selected from URL or default to current
                const shouldSelect = this.urlGameweek ? (gw === this.urlGameweek) : (gw === currentGameweek);
                if (shouldSelect) {
                    option.selected = true;
                }
                
                select.appendChild(option);
            }
        } else {
            // Fallback if no events data
            const selectedGameweek = this.urlGameweek || currentGameweek || 1;
            const option = document.createElement('option');
            option.value = selectedGameweek;
            option.textContent = `Gameweek ${selectedGameweek}`;
            option.selected = true;
            select.appendChild(option);
        }
        
        // Clear the URL gameweek after using it
        delete this.urlGameweek;
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
     * Cache helper methods
     */
    getCacheKey(entryId, gameweek) {
        return `${entryId}-${gameweek}`;
    }

    /**
     * Check for cached JSON data file with timestamp
     */
    async checkForCachedData(leagueId, gameweek) {
        try {
            // Request list of matching cache files from server
            const pattern = `gw${gameweek}-league${leagueId}-*`;
            const response = await fetch(`/api/cache-files?pattern=${encodeURIComponent(pattern)}`);
            
            if (!response.ok) {
                return null;
            }
            
            const files = await response.json();
            
            if (!files || files.length === 0) {
                return null;
            }
            
            // Check files from newest to oldest
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            
            for (const filename of files) {
                // Extract timestamp from filename
                const match = filename.match(/gw\d+-league\d+-(\d+)\.json/);
                if (match) {
                    const timestamp = parseInt(match[1]);
                    
                    // Check if file is fresh (within 1 hour)
                    if (timestamp > oneHourAgo) {
                        // Fetch and return this fresh file
                        const dataResponse = await fetch(`/out/${filename}`);
                        if (dataResponse.ok) {
                            const data = await dataResponse.json();
                            return data;
                        }
                    }
                }
            }
            
            return null; // No valid cache found
        } catch (error) {
            console.error('Error checking cache:', error);
            return null;
        }
    }

    /**
     * Process cached data into the expected format for display
     */
    processCachedData(cachedData, config) {
        if (!cachedData || !cachedData.teams) {
            return [];
        }
        
        
        return cachedData.teams.map(team => {
            // Convert cached team data to expected format
            const arsenalPlayers = this.arsenalPlayers || new Set();
            let arsenalInSquad = 0;
            let arsenalInStartingXI = 0;
            let arsenalSquadNames = [];
            let arsenalPlayerNames = [];
            let captainIsArsenal = false;
            let viceCaptainIsArsenal = false;
            
            // Analyze picks for rule compliance (safely)
            if (team.picks && Array.isArray(team.picks)) {
                team.picks.forEach(pick => {
                    if (arsenalPlayers.has(pick.playerId)) {
                        arsenalInSquad++;
                        arsenalSquadNames.push(pick.name);
                    }
                    if (pick.isStarting && arsenalPlayers.has(pick.playerId)) {
                        arsenalInStartingXI++;
                        arsenalPlayerNames.push(pick.name);
                    }
                    if (pick.isCaptain && arsenalPlayers.has(pick.playerId)) {
                        captainIsArsenal = true;
                    }
                    if (pick.isViceCaptain && arsenalPlayers.has(pick.playerId)) {
                        viceCaptainIsArsenal = true;
                    }
                });
            }
            
            // Check rule compliance
            const squadCountPass = this.checkPlayerCount(arsenalInSquad, config.arsenal?.playersInSquad || {enabled: false});
            const playerCountPass = this.checkPlayerCount(arsenalInStartingXI, config.arsenal?.playersInStartingXI || {enabled: false});
            const captainPass = !config.arsenal?.captain?.enabled || !config.arsenal?.captain?.mustBeArsenal || captainIsArsenal;
            const viceCaptainPass = !config.arsenal?.viceCaptain?.enabled || !config.arsenal?.viceCaptain?.mustBeArsenal || viceCaptainIsArsenal;
            const allRulesPassed = squadCountPass && playerCountPass && captainPass && viceCaptainPass;
            
            return {
                entry_name: team.teamName,
                player_name: team.managerName,
                entry: team.entryId,
                total: team.totalPoints,
                rank: team.rank,
                allRulesPassed: allRulesPassed,
                arsenalInSquad: arsenalInSquad,
                arsenalInStartingXI: arsenalInStartingXI,
                arsenalSquadNames: arsenalSquadNames,
                arsenalPlayerNames: arsenalPlayerNames,
                captainName: team.captain?.name || 'Unknown',
                viceCaptainName: team.viceCaptain?.name || 'Unknown',
                captainIsArsenal: captainIsArsenal,
                viceCaptainIsArsenal: viceCaptainIsArsenal,
                players: (team.picks || []).map(pick => ({
                    name: pick.name || 'Unknown',
                    position: pick.position || 0,
                    isArsenal: arsenalPlayers.has(pick.playerId),
                    isCaptain: !!pick.isCaptain,
                    isViceCaptain: !!pick.isViceCaptain,
                    isStarting: !!pick.isStarting
                })),
                checks: {
                    squadCount: squadCountPass,
                    playerCount: playerCountPass,
                    captain: captainPass,
                    viceCaptain: viceCaptainPass
                },
                ruleResults: {
                    arsenalPlayersInStartingXI: {
                        passed: playerCountPass,
                        count: arsenalInStartingXI
                    },
                    arsenalCaptain: {
                        passed: captainPass
                    },
                    arsenalViceCaptain: {
                        passed: viceCaptainPass
                    }
                }
            };
        });
    }
    
    isValidCache(timestamp) {
        return (Date.now() - timestamp) < this.cacheExpiry;
    }
    
    getFromCache(entryId, gameweek) {
        const key = this.getCacheKey(entryId, gameweek);
        const cached = this.teamCache.get(key);
        
        if (cached && this.isValidCache(cached.timestamp)) {
            return cached.data;
        }
        
        return null;
    }
    
    saveToCache(entryId, gameweek, data) {
        const key = this.getCacheKey(entryId, gameweek);
        this.teamCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
    
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.teamCache.entries()) {
            if ((now - value.timestamp) >= this.cacheExpiry) {
                this.teamCache.delete(key);
            }
        }
    }

    /**
     * Failed request tracking methods
     */
    getRetryKey(entryId, gameweek) {
        return `${entryId}-${gameweek}`;
    }
    
    addFailedTeam(entryId, gameweek, config, error) {
        // Check if team is already in failed list (avoid duplicates)
        const existingFailed = this.failedTeams.find(team => team.entryId === entryId);
        if (!existingFailed) {
            this.failedTeams.push({ entryId, gameweek, config, error: error.message });
        }
        
        // Trigger immediate pause
        this.shouldPauseImmediately = true;
        return true; // ALWAYS retry - no limits!
    }
    
    clearFailedTeams() {
        this.failedTeams = [];
        this.currentRetryDelay = this.baseRetryDelay; // Reset delay
        this.pauseRound = 0; // Reset pause round
    }
    
    /**
     * Clear previous results table on new analysis
     */
    clearPreviousResults() {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
        
        const resultsTableBody = document.getElementById('resultsTableBody');
        if (resultsTableBody) {
            resultsTableBody.innerHTML = '';
        }
        
        const resultsSummary = document.querySelector('.results-summary');
        if (resultsSummary) {
            resultsSummary.remove();
        }
        
    }
    
    /**
     * Calculate next delay with exponential backoff: 5s, 10s, 20s, 40s, then reset to 5s
     */
    calculateNextDelay() {
        this.pauseRound++;
        this.currentRetryDelay = this.baseRetryDelay * Math.pow(2, this.pauseRound - 1);
        
        // Cap at 40s for fairness, then reset to 5s
        if (this.currentRetryDelay > 40000) {
            this.currentRetryDelay = this.baseRetryDelay; // Reset to 5s
            this.pauseRound = 1; // Reset round counter
        }
        
        return this.currentRetryDelay;
    }

    /**
     * Retry all failed teams
     */
    async retryFailedTeams(config) {
        const teamsToRetry = [...this.failedTeams]; // Copy array
        this.failedTeams = []; // Clear for new failures
        
        const results = [];
        const batchSize = Math.min(3, teamsToRetry.length); // Smaller batches for retries
        
        for (let i = 0; i < teamsToRetry.length; i += batchSize) {
            const batch = teamsToRetry.slice(i, Math.min(i + batchSize, teamsToRetry.length));
            const batchPromises = batch.map(async (failedTeam) => {
                const { entryId, gameweek, config: teamConfig } = failedTeam;
                
                try {
                    const checkResult = await this.checkTeamCompliance(entryId, gameweek, teamConfig);
                    if (checkResult) {
                        // Find the original team data
                        const originalTeam = this.originalTeams?.find(t => t.entry === entryId) || { entry: entryId };
                        return { ...originalTeam, ...checkResult };
                    }
                } catch (error) {
                }
                return null;
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
            
            // Small delay between retry batches
            if (i + batchSize < teamsToRetry.length) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between retry batches
            }
        }
        
        return results;
    }
    
    /**
     * Process failed teams with exponential backoff until ALL complete
     */
    async processFailedTeamsUntilComplete(config, results, completedTeams, totalTeams) {
        let retryRound = 1;
        let totalRetrySuccesses = 0;
        
        while (this.failedTeams.length > 0) {
            const failedCount = this.failedTeams.length;
            const nextDelay = this.calculateNextDelay();
            
            
            this.ui.updateProgress(50, `⏸️ Pause: Waiting ${nextDelay/1000}s for API cooldown (${completedTeams}/${totalTeams} completed)...`);
            
            // Exponential backoff pause: 5s, 10s, 20s, 40s, 80s...
            await new Promise(resolve => setTimeout(resolve, nextDelay));
            
            // Retry ALL failed teams - keep retrying until they ALL succeed
            this.ui.updateProgress(55, `🔄 Retrying ${failedCount} failed teams...`);
            
            const beforeRetryCount = this.failedTeams.length;
            const retryResults = await this.retryFailedTeams(config);
            const afterRetryCount = this.failedTeams.length;
            const succeededCount = beforeRetryCount - afterRetryCount;
            
            results.push(...retryResults);
            totalRetrySuccesses += succeededCount;
            
            
            retryRound++;
            
            // Safety check to prevent infinite loops (though we'll keep trying)
            if (retryRound > 20) {
            }
        }
        
        
        // Reset pause delays for next potential failure
        this.currentRetryDelay = this.baseRetryDelay; // Reset to 5s
        this.pauseRound = 0;
        
        return totalRetrySuccesses; // Return count of successfully retried teams
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
            
            this.populateGameweekDropdown(data.events, this.currentGameweek);
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
        if (!requirement || !requirement.enabled) return true;
        
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
        // Check cache first
        const cachedData = this.getFromCache(entryId, gameweek);
        let data;
        
        if (cachedData) {
            data = cachedData;
        } else {
            // No cache or expired, fetch from API
            const url = FPLConfig.api.baseUrl + 
                FPLConfig.api.endpoints.teamPicks
                    .replace('{entryId}', entryId)
                    .replace('{gameweek}', gameweek);
            
            try {
                data = await this.fetchData(url);
                // Save to cache for future use
                this.saveToCache(entryId, gameweek, data);
            } catch (error) {
                // Check if it's a retryable error (429, timeout, network issues)
                const isRetryableError = 
                    error.message.includes('429') || 
                    error.message.includes('timeout') ||
                    error.message.includes('500') ||
                    error.message.includes('502') ||
                    error.message.includes('503') ||
                    error.message.includes('fetch');
                
                if (isRetryableError) {
                    // Add to failed teams for retry
                    this.addFailedTeam(entryId, gameweek, config, error);
                    return null; // Will be retried later
                } else {
                    // Non-retryable error (team doesn't exist, etc.)
                    return null;
                }
            }
        }
        
        try {
            
            let arsenalInSquad = 0;
            let arsenalInStartingXI = 0;
            let arsenalSquadNames = [];
            let arsenalPlayerNames = [];
            let captainIsArsenal = false;
            let viceCaptainIsArsenal = false;
            let captainName = '';
            let viceCaptainName = '';
            
            data.picks.forEach(pick => {
                const isArsenalPlayer = this.arsenalPlayers.has(pick.element);
                
                // Check if Arsenal player in squad (all 15 players)
                if (isArsenalPlayer) {
                    arsenalInSquad++;
                    arsenalSquadNames.push(this.allPlayers[pick.element]?.name || 'Unknown');
                }
                
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
            const squadCountPass = this.checkPlayerCount(arsenalInSquad, config.arsenal.playersInSquad);
            const playerCountPass = this.checkPlayerCount(arsenalInStartingXI, config.arsenal.playersInStartingXI);
            const captainPass = !config.arsenal.captain.enabled || !config.arsenal.captain.mustBeArsenal || captainIsArsenal;
            const viceCaptainPass = !config.arsenal.viceCaptain.enabled || !config.arsenal.viceCaptain.mustBeArsenal || viceCaptainIsArsenal;
            
            const allRulesPassed = squadCountPass && playerCountPass && captainPass && viceCaptainPass;
            
            return {
                arsenalInSquad,
                arsenalInStartingXI,
                arsenalSquadNames,
                arsenalPlayerNames,
                captainName,
                viceCaptainName,
                captainIsArsenal,
                viceCaptainIsArsenal,
                checks: {
                    squadCount: squadCountPass,
                    playerCount: playerCountPass,
                    captain: captainPass,
                    viceCaptain: viceCaptainPass
                },
                allRulesPassed
            };
            
        } catch (error) {
            return null;
        }
    }

    /**
     * Main analysis process
     */
    async processLeague(config) {
        try {
            // Load master data first (needed for Arsenal players)
            this.ui.updateProgress(5, 'Loading data...');
            await this.loadMasterData();
            
            // Try to load from cache immediately
            let cachedData = await this.checkForCachedData(config.league.id, config.league.gameweek);
            
            if (!cachedData) {
                // Cache doesn't exist, generate it
                this.ui.updateProgress(10, 'Generating data (this may take a moment for large leagues)...');
                try {
                    const response = await fetch('/api/generate-cache', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            leagueId: config.league.id, 
                            gameweek: config.league.gameweek 
                        })
                    });
                    const result = await response.json();
                    if (result.success) {
                        // Poll for cache file with timeout
                        let attempts = 0;
                        const maxAttempts = 30; // 30 seconds max wait
                        
                        while (attempts < maxAttempts && !cachedData) {
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds instead of 1
                            cachedData = await this.checkForCachedData(config.league.id, config.league.gameweek);
                            attempts++;
                            
                            if (!cachedData && attempts % 3 === 0) { // Update progress every 6 seconds
                                this.ui.updateProgress(10 + (attempts * 2), `Still generating... (${attempts * 2}s)`);
                            }
                        }
                    }
                } catch (error) {
                }
            }
            
            if (cachedData) {
                // Cache exists - use it with smooth transition
                const results = this.processCachedData(cachedData, config);
                this.ui.updateProgress(100, `🎉 Analysis complete! ${results.length} teams loaded instantly!`);
                
                // Set league name from cached data
                this.leagueName = cachedData.metadata?.leagueName || `League ${config.league.id}`;
                
                // Add smooth delay before showing results
                await new Promise(resolve => setTimeout(resolve, 1200));
                
                // Display results
                this.ui.displayResults(results, config, this.leagueName, `Data from cache (${cachedData.metadata?.generatedAt ? new Date(cachedData.metadata.generatedAt).toLocaleString() : 'Unknown time'})`);
                return;
            }
            
            this.ui.updateProgress(20, 'Fetching league teams...');
            
            // Get league teams (fallback to API)
            const teams = await this.getLeagueTeams(config.league.id);
            
            // Store original teams for retry logic
            this.originalTeams = teams;
            
            // Clear failed teams from previous runs
            this.clearFailedTeams();
            this.clearExpiredCache();
            
            this.ui.updateProgress(30, `Processing ${teams.length} teams...`);
            
            const results = [];
            const batchSize = FPLConfig.api.batchSize;
            
            // Process teams in batches with immediate pause on 429
            let attemptedTeams = 0;
            let completedTeams = 0;
            
            for (let i = 0; i < teams.length; i += batchSize) {
                // Reset pause flag for this batch
                this.shouldPauseImmediately = false;
                
                const batch = teams.slice(i, Math.min(i + batchSize, teams.length));
                const batchPromises = batch.map(team => 
                    this.checkTeamCompliance(team.entry, config.league.gameweek, config).then(checkResult => 
                        checkResult ? { ...team, ...checkResult } : null
                    )
                );
                
                const batchResults = await Promise.all(batchPromises);
                const validResults = batchResults.filter(r => r !== null);
                results.push(...validResults);
                
                attemptedTeams += batch.length;
                completedTeams += validResults.length;
                
                // Check if we need to pause immediately due to 429 error
                if (this.shouldPauseImmediately && this.failedTeams.length > 0) {
                    // Process failed teams with exponential backoff until ALL succeed
                    const addedResults = await this.processFailedTeamsUntilComplete(config, results, completedTeams, teams.length);
                    completedTeams += addedResults; // Update completed count with successful retries
                    
                    // Reset pause flag and continue
                    this.shouldPauseImmediately = false;
                }
                
                // Update progress based on COMPLETED teams, not just attempted
                const progress = 30 + Math.floor(completedTeams / teams.length * 60);
                this.ui.updateProgress(progress, `Completed ${completedTeams}/${teams.length} teams (attempted ${attemptedTeams})...`);
                
                // Normal delay between batches (if not paused)
                if (!this.shouldPauseImmediately && FPLConfig.api.requestDelay > 0 && i + batchSize < teams.length) {
                    await new Promise(resolve => setTimeout(resolve, FPLConfig.api.requestDelay));
                }
            }
            
            const totalTeams = results.length;
            const finalMessage = this.failedTeams.length > 0 
                ? `Analysis complete! ${totalTeams} teams processed, ${this.failedTeams.length} failed permanently.`
                : `🎉 Analysis complete! All ${totalTeams} teams processed successfully!`;
            
            this.ui.updateProgress(100, finalMessage);
            
            // Add smooth delay before showing results
            await new Promise(resolve => setTimeout(resolve, 1200));
            
            // Display results
            this.ui.displayResults(results, config, this.leagueName, this.dataUpdatedAt);
            
        } catch (error) {
            this.ui.showError(error.message);
        }
    }

    /**
     * Load current gameweek
     */
    async loadCurrentGameweek() {
        try {
            await this.loadMasterData();
        } catch (error) {
            this.currentGameweek = 1;
            this.populateGameweekDropdown(null, 1);
        }
    }
    
    /**
     * Handle form submission and start analysis
     */
    async analyzeLeague() {
        if (this.isProcessing) return;
        
        const formData = this.getFormData();
        if (!formData) return;
        
        // Update URL with current form data
        this.updateURL();
        
        // Collapse sidebar on mobile when starting analysis
        if (window.innerWidth <= 1023) {
            const content = document.getElementById('sidebarContent');
            const arrow = document.querySelector('.toggle-arrow');
            if (content && content.classList.contains('show')) {
                content.classList.remove('show');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        }
        
        this.isProcessing = true;
        
        // Clear previous results table
        this.clearPreviousResults();
        
        this.ui.showProgress();
        
        try {
            await this.processLeague(formData);
        } catch (error) {
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
        
        const selectedGameweek = parseInt(document.getElementById('gameweekSelect').value);
        if (!selectedGameweek || selectedGameweek < 1 || selectedGameweek > 38) {
            this.ui.showError('Please select a valid gameweek.');
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
                gameweek: selectedGameweek
            },
            arsenal: {
                playersInSquad: {
                    enabled: document.getElementById('squadRule').checked,
                    count: parseInt(document.getElementById('squadCount').value),
                    operator: document.getElementById('squadOperator').value
                },
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
        this.elements.resultsSection.style.display = 'block'; // Show results section
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