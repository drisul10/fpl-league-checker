const https = require('https');
const fs = require('fs');
const config = require('./rules-config');

const ARSENAL_TEAM_ID = 1;
let arsenalPlayers = new Set();
let allPlayers = {};
let leagueName = '';

/**
 * Fetch data from URL
 */
function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Load master data and identify Arsenal players
 */
async function loadMasterData() {
    console.log('Loading master data...');
    const url = config.api.baseUrl + config.api.endpoints.bootstrap;
    const data = await fetchData(url);
    
    // Store all players and identify Arsenal players
    data.elements.forEach(player => {
        allPlayers[player.id] = {
            name: player.web_name,
            team: player.team,
            position: player.element_type,
            price: player.now_cost / 10
        };
        
        if (player.team === ARSENAL_TEAM_ID) {
            arsenalPlayers.add(player.id);
        }
    });
    
    console.log(`Found ${arsenalPlayers.size} Arsenal players`);
    return data;
}

/**
 * Get all teams from the league
 */
async function getLeagueTeams() {
    console.log(`Fetching league ${config.league.id} standings...`);
    const maxTeams = config.league.maxTeamsToCheck;
    let allTeams = [];
    let page = 1;
    let hasNext = true;
    
    while (hasNext) {
        const url = config.api.baseUrl + 
            config.api.endpoints.leagueStandings
                .replace('{leagueId}', config.league.id) + 
            `?page_new_entries=1&page_standings=${page}&phase=1`;
        
        const data = await fetchData(url);
        
        // Get league name from first page
        if (page === 1 && data.league && data.league.name) {
            leagueName = data.league.name;
        }
        
        if (data.standings && data.standings.results) {
            allTeams = allTeams.concat(data.standings.results);
        }
        
        hasNext = data.standings?.has_next || false;
        
        // Stop if we've reached the max teams limit
        if (maxTeams && allTeams.length >= maxTeams) {
            allTeams = allTeams.slice(0, maxTeams);
            break;
        }
        
        page++;
        if (page > 20) break; // Safety limit
    }
    
    console.log(`Processing ${allTeams.length} teams from league`);
    return allTeams;
}

/**
 * Check if a team meets Arsenal player count requirements
 */
function checkPlayerCount(count, requirement) {
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
 * Check team picks against rules
 */
async function checkTeamPicks(entryId, gameweek) {
    const url = config.api.baseUrl + 
        config.api.endpoints.teamPicks
            .replace('{entryId}', entryId)
            .replace('{gameweek}', gameweek);
    
    try {
        const data = await fetchData(url);
        
        let arsenalInStartingXI = 0;
        let arsenalPlayerNames = [];
        let captainIsArsenal = false;
        let viceCaptainIsArsenal = false;
        let captainName = '';
        let viceCaptainName = '';
        let players = [];
        
        data.picks.forEach(pick => {
            const isArsenalPlayer = arsenalPlayers.has(pick.element);
            const player = allPlayers[pick.element];
            const playerName = player?.name || 'Unknown';
            
            // Store all player info
            players.push({
                name: playerName,
                position: player?.position || 0,
                isArsenal: isArsenalPlayer,
                isCaptain: pick.is_captain,
                isViceCaptain: pick.is_vice_captain,
                isStarting: pick.multiplier > 0
            });
            
            // Check if in starting XI (multiplier > 0)
            if (pick.multiplier > 0 && isArsenalPlayer) {
                arsenalInStartingXI++;
                arsenalPlayerNames.push(playerName);
            }
            
            // Check captain
            if (pick.is_captain) {
                captainIsArsenal = isArsenalPlayer;
                captainName = playerName;
            }
            
            // Check vice-captain
            if (pick.is_vice_captain) {
                viceCaptainIsArsenal = isArsenalPlayer;
                viceCaptainName = playerName;
            }
        });
        
        // Evaluate Arsenal rules
        const playerCountPass = checkPlayerCount(arsenalInStartingXI, config.arsenal.playersInStartingXI);
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
            players: players,
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
 * Generate JSON report
 */
function generateJSONReport(results) {
    const compliantTeams = results.filter(r => r.allRulesPassed);
    const nonCompliantTeams = results.filter(r => !r.allRulesPassed);
    
    return {
        metadata: {
            leagueName: leagueName,
            gameweek: config.league.gameweek,
            leagueId: config.league.id,
            generatedAt: new Date().toISOString(),
            totalTeams: results.length
        },
        summary: {
            totalTeams: results.length,
            compliantTeams: compliantTeams.length,
            nonCompliantTeams: nonCompliantTeams.length,
            complianceRate: ((compliantTeams.length / results.length) * 100).toFixed(1) + '%'
        },
        rules: {
            playersInStartingXI: config.arsenal.playersInStartingXI,
            captain: config.arsenal.captain,
            viceCaptain: config.arsenal.viceCaptain
        },
        results: results.map(team => ({
            teamName: team.teamName,
            managerName: team.managerName,
            entryId: team.entryId,
            totalPoints: team.totalPoints,
            rank: team.rank,
            allRulesPassed: team.allRulesPassed,
            ruleResults: team.ruleResults,
            players: team.players.map(p => ({
                name: p.name,
                position: p.position,
                isArsenal: p.isArsenal,
                isCaptain: p.isCaptain,
                isViceCaptain: p.isViceCaptain,
                isStarting: p.isStarting
            }))
        }))
    };
}

/**
 * Main function
 */
async function main() {
    try {
        console.log(`🏆 FPL JSON Checker starting...`);
        console.log(`📝 Configuration: League ${config.league.id}, Gameweek ${config.league.gameweek}`);
        
        await loadMasterData();
        const teams = await getLeagueTeams();
        
        let results = [];
        let processed = 0;
        const totalTeams = teams.length;
        
        for (const team of teams) {
            console.log(`⚙️ Checking team ${++processed}/${totalTeams}: ${team.player_name} (${team.entry_name})`);
            
            const teamCheck = await checkTeamPicks(team.entry, config.league.gameweek);
            
            if (teamCheck) {
                results.push({
                    teamName: team.entry_name,
                    managerName: team.player_name,
                    entryId: team.entry,
                    totalPoints: team.total,
                    rank: team.rank,
                    allRulesPassed: teamCheck.allRulesPassed,
                    players: teamCheck.players,
                    ruleResults: {
                        arsenalPlayersInStartingXI: {
                            passed: teamCheck.checks.playerCount,
                            count: teamCheck.arsenalInStartingXI
                        },
                        arsenalCaptain: {
                            passed: teamCheck.checks.captain
                        },
                        arsenalViceCaptain: {
                            passed: teamCheck.checks.viceCaptain
                        }
                    }
                });
            }
            
            if (config.api.requestDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, config.api.requestDelay));
            }
        }
        
        // Generate JSON report
        // Create output directory if it doesn't exist
        const outputDir = './out';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate filename: gw{gameweek}-league{leagueId}.json
        const filename = `gw${config.league.gameweek}-league${config.league.id}.json`;
        const fullPath = `${outputDir}/${filename}`;
        
        const jsonData = generateJSONReport(results);
        fs.writeFileSync(fullPath, JSON.stringify(jsonData, null, 2));
        console.log(`\n📄 JSON report saved as: ${fullPath}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();