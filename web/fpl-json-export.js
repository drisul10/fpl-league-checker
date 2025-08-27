const https = require('https');
const fs = require('fs');

// Configuration - can be overridden by command line args
let LEAGUE_ID = 436453;
let GAMEWEEK = 2;

// Parse command line arguments
if (process.argv[2]) LEAGUE_ID = parseInt(process.argv[2]);
if (process.argv[3]) GAMEWEEK = parseInt(process.argv[3]);

const API_BASE_URL = "https://fantasy.premierleague.com/api";
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
 * Load master data (all players info)
 */
async function loadMasterData() {
    console.log('Loading master data...');
    const url = `${API_BASE_URL}/bootstrap-static/`;
    const data = await fetchData(url);
    
    // Store all players
    data.elements.forEach(player => {
        allPlayers[player.id] = {
            name: player.web_name,
            team: player.team,
            position: player.element_type,
            price: player.now_cost / 10
        };
    });
    
    console.log(`Loaded ${Object.keys(allPlayers).length} players`);
    return data;
}

/**
 * Get all teams from the league
 */
async function getLeagueTeams() {
    console.log(`Fetching league ${LEAGUE_ID} standings...`);
    let allTeams = [];
    let page = 1;
    let hasNext = true;
    
    while (hasNext) {
        const url = `${API_BASE_URL}/leagues-classic/${LEAGUE_ID}/standings/?page_new_entries=1&page_standings=${page}&phase=1`;
        
        const data = await fetchData(url);
        
        // Get league name from first page
        if (page === 1 && data.league && data.league.name) {
            leagueName = data.league.name;
        }
        
        if (data.standings && data.standings.results) {
            allTeams = allTeams.concat(data.standings.results);
        }
        
        hasNext = data.standings?.has_next || false;
        
        page++;
        if (page > 50) break; // Safety limit
    }
    
    console.log(`Found ${allTeams.length} teams from league`);
    return allTeams;
}

/**
 * Get team picks for a specific gameweek
 */
async function getTeamPicks(entryId, gameweek) {
    const url = `${API_BASE_URL}/entry/${entryId}/event/${gameweek}/picks/`;
    
    try {
        const data = await fetchData(url);
        
        let players = [];
        let captain = null;
        let viceCaptain = null;
        
        data.picks.forEach(pick => {
            const player = allPlayers[pick.element];
            const playerInfo = {
                playerId: pick.element,
                name: player?.name || 'Unknown',
                team: player?.team || 0,
                position: pick.position,
                multiplier: pick.multiplier,
                isCaptain: pick.is_captain,
                isViceCaptain: pick.is_vice_captain,
                isStarting: pick.multiplier > 0
            };
            
            players.push(playerInfo);
            
            if (pick.is_captain) {
                captain = playerInfo;
            }
            if (pick.is_vice_captain) {
                viceCaptain = playerInfo;
            }
        });
        
        return {
            entryPointsTotal: data.entry_history?.total_points || 0,
            eventPoints: data.entry_history?.points || 0,
            players: players,
            captain: captain,
            viceCaptain: viceCaptain
        };
        
    } catch (error) {
        console.error(`Error fetching picks for team ${entryId}:`, error.message);
        return null;
    }
}

/**
 * Generate JSON report
 */
function generateJSONReport(results) {
    return {
        metadata: {
            leagueName: leagueName,
            gameweek: GAMEWEEK,
            leagueId: LEAGUE_ID,
            generatedAt: new Date().toISOString(),
            totalTeams: results.length
        },
        teams: results
    };
}

/**
 * Main function
 */
async function main() {
    try {
        console.log(`🏆 FPL Team Fetcher starting...`);
        console.log(`📝 Configuration: League ${LEAGUE_ID}, Gameweek ${GAMEWEEK}`);
        console.log(`📝 Usage: node fpl-json-export.js [leagueId] [gameweek]`);
        
        await loadMasterData();
        const teams = await getLeagueTeams();
        
        let results = [];
        let processed = 0;
        const totalTeams = teams.length;
        const batchSize = 50;
        
        // Process teams in batches of 50
        for (let i = 0; i < totalTeams; i += batchSize) {
            const batch = teams.slice(i, i + batchSize);
            const batchPromises = batch.map(async (team) => {
                const teamPicks = await getTeamPicks(team.entry, GAMEWEEK);
                processed++;
                console.log(`⚙️ Fetching team ${processed}/${totalTeams}: ${team.player_name} (${team.entry_name})`);
                
                if (teamPicks) {
                    return {
                        entryId: team.entry,
                        teamName: team.entry_name,
                        managerName: team.player_name,
                        rank: team.rank,
                        totalPoints: team.total,
                        gameweekPoints: teamPicks.eventPoints,
                        entryPointsTotal: teamPicks.entryPointsTotal,
                        picks: teamPicks.players,
                        captain: teamPicks.captain,
                        viceCaptain: teamPicks.viceCaptain
                    };
                }
                return null;
            });
            
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(result => result !== null));
            
            console.log(`📊 Batch ${Math.ceil((i + batchSize) / batchSize)} complete: ${results.length} teams processed`);
        }
        
        // Generate JSON report
        const outputDir = './out';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const timestamp = Date.now();
        const filename = `gw${GAMEWEEK}-league${LEAGUE_ID}-${timestamp}.json`;
        const fullPath = `${outputDir}/${filename}`;
        
        const jsonData = generateJSONReport(results);
        fs.writeFileSync(fullPath, JSON.stringify(jsonData, null, 2));
        console.log(`\n📄 JSON report saved as: ${fullPath}`);
        console.log(`📊 Summary: ${results.length} teams fetched successfully`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();