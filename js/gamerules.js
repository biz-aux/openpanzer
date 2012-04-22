/**
 * GameRules - Provides basic rules for HTML5 PG2
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

var GameRules = GameRules || {}; //Namespace emulation

//returns a cell list with hexes that a unit @ row,col can move to
//Works by computing cost of ajacent hexes by range expanding from 0 to unit movpoints
//cin is the cost of entering the current hex which is equal to  the cost of exiting from 
//the hex with a range smaller by 1 than the current hex
//cout cost of exiting a hex which is cin + terrain movement cost
//each time a hex with cout smaller that adjacent hexes cout the adjacent hexes are updated 
//with the new cost
//TODO stopmov, briges, zone of control
GameRules.getMoveRange = function(map, row, col, mrows, mcols)
{
	var r = 0;
	var allowedCells = [];
	var unit = map[row][col].unit;
	
	if (unit === null || unit.hasMoved) return [];
	
	var range = unit.unitData().movpoints;
	var movmethod = unit.unitData().movmethod;
	var moveCost = movTable[movmethod];
	
	
	if (GameRules.unitUsesFuel(unit) && (unit.getFuel() < range)) 
		range = unit.getFuel();
	
	//Towed units with no transport should be able to move at 1 range 
	if ((movmethod === movMethod.towed) && (unit.transport === null) && (range === 0))
		range = 1;	
	
	console.log("move range:" + range);
	
	var c = getCellsInRange(row, col, range, mrows, mcols);
	startingCell = new Cell(row, col); //current unit cell is not added in cellList returned by getCellsInRange
	c.push(startingCell);
	
	while (r <= range)
	{
		for (i = 0; i < c.length; i++)
		{
			if (c[i].range == r)
			{
				//console.log("Range:" + c[i].range + " Row:"+ c[i].row + " Col:" + c[i].col);
				for (j  = 0; j < c.length; j++)
				{
					if (c[j].range < r) continue; //Not always true, there might be a path to reach a hex by turning back
					if (isAdjacent(c[i].row, c[i].col, c[j].row, c[j].col))
					{
						hex = map[c[j].row][c[j].col];
						if (hex.road > roadType.none) 
							c[j].cost = moveCost[17]; //Road entry in movement table
						else
							c[j].cost = moveCost[hex.terrain];
						
						if (c[j].cin == 0) c[j].cin = c[i].cout;
						if (c[j].cout == 0) c[j].cout = c[j].cin + c[j].cost;
						if (c[j].cin > c[i].cout)
						{
							c[j].cin = c[i].cout;
							c[j].cout = c[j].cin + c[j].cost;
						}
						if ((mi = canMoveInto(map, unit, c[j])) && (c[j].cout <= range)) c[j].allow = true; //TODO canMoveInto should be checked sooner
						//else console.log("Row:"+ c[j].row + " Col:" + c[j].col + " discarded for range:" + r + " with cout:" + c[j].cout + " can move into:" + mi);
					}
				}
			}
		}
		r++;
	}
	
	
	for (var i = 0; i < c.length; i++)
	{
		if (c[i].allow == true)
			allowedCells.push(c[i]);
	}
	
	return allowedCells;
}

GameRules.getAttackRange = function(map, row, col, mrows, mcols)
{
	var allowedCells = [];
	var unit = map[row][col].unit;
	
	if (unit === null || unit.hasFired || unit.getAmmo() <= 0) return []; 
	
	//TODO weather ?
	var range = unit.unitData().gunrange;
	if (range == 0)	range = 1;
		
	console.log("attack range: "+ range);
	var cellList = getCellsInRange(row, col, range, mrows, mcols);
	for (var i = 0; i < cellList.length; i++)
	{
		var cell = cellList[i];
		if (canAttack(unit, map[cell.row][cell.col].unit))
		{
			allowedCells.push(cell);
		}
	}
	return allowedCells;
}

//aUnit from position aUnitPos attacks tUnit from tUnitPos
//TODO dig the actual formula (how many pages it is ?) 
//prolly depends on: weather, terrain, adjacent units (arty), initiative, fuel, ammo
//experience, ranged defense modified, entrechment, unit strength etc ...
GameRules.calculateAttackResults = function(aUnit, arow, acol, tUnit, trow, tcol)
{
	var cr = new combatResults();

	var d = GameRules.distance(arow, acol, trow, tcol); //distance between units
	var at = aUnit.unitData().target;
	var tt = tUnit.unitData().target;
	var aav = 0;
	var adv = 0;
	var tav = 0;
	var tdv = 0;
	//Attacking unit type
	switch(at)
	{
		case unitType.air:
		{
			tav = tUnit.unitData().airatk;
			tdv = tUnit.unitData().airdef;
			break;
		}
		case unitType.soft:
		{
			tav = tUnit.unitData().softatk;
			tdv = tUnit.unitData().grounddef;
			break;
		}
		case unitType.hard:
		{
			tav = tUnit.unitData().hardatk;
			tdv = tUnit.unitData().grounddef;
			break;
		}
	}
	
	switch(tt)
	{
		case unitType.air:
		{
			
			aav = aUnit.unitData().airatk;
			adv = aUnit.unitData().airdef;
			break;
		}
		case unitType.soft:
		{
			aav = aUnit.unitData().softatk;
			adv = aUnit.unitData().grounddef;
			break;
		}
		case unitType.hard:
		{
			aav = aUnit.unitData().hardatk;
			adv = aUnit.unitData().grounddef;
			break;
		}
	}
	
	cr.kills = Math.round(aUnit.strength * (aav - tdv)/10);
	if (cr.kills <= 0 ) cr.kills = 1;
	//if distance between units > 1 means that target unit can fight back //TODO check if always true
	if (d <= 1)
	{
		cr.losses = Math.round(tUnit.strength * (tav - adv)/10);
		if (cr.losses < 0) cr.losses = 0;
	}
	
	return cr;
}

//TODO Terrain, Unit type and adjacent units 
GameRules.getResupplyValue = function(unit)
{
	if (!canResupply(unit)) return 0, 0;
	var ammo = unit.unitData().ammo - unit.getAmmo();
	var fuel = unit.unitData().fuel - unit.getFuel();
	if (fuel < 0) fuel = 0;
	
	return new Supply(ammo, fuel);
}

//TODO Terrain, Unit type and adjacent units 
GameRules.getReinforceValue = function(unit)
{
	if (!canReinforce(unit)) return 0;
	var strength = 10 - unit.strength;
	
	return strength;
}

function canAttack(unit, targetUnit)
{
	if (unit.getAmmo() <= 0)
		return false;
	if (targetUnit === null)
		return false;
	if (unit.owner === targetUnit.owner)
		return false;
	if (unit.unitData().airatk == 0 && isAir(targetUnit)) //TODO There is a special bit for this.
		return false;
		
	return true;
}
//Checks if a given unit can move into a hex
//TODO Air units can move over ground units
function canMoveInto(map, unit, cell)
{
	hex = map[cell.row][cell.col];
	if (hex.unit !== null) 	return false;
	return true;
	
	//TODO adjacently units zone of control ?
	if (isGround(unit))
	{
		return true;
	}
	
	if (isAir(unit))
	{
		return true;
	}
	
	if (isSea(unit))
	{	
		return true;
	}
	return false;
}

function canResupply(unit)
{
	if (unit.hasMoved)
		return false;
	if (unit.hasFired)
		return false;
	if (unit.hasResupplied)
		return false;
	if (unit.hasReinforced)
		return false;
	if ((unit.getFuel() == unit.unitData().fuel) &&
		(unit.getAmmo() == unit.unitData().ammo))
		return false;
		
	return true;
}
GameRules.canResupply = function(unit) { return canResupply(unit);}

function canReinforce(unit)
{
	if (unit.hasMoved)
		return false;
	if (unit.hasFired)
		return false;
	if (unit.hasResupplied)
		return false;
	if (unit.hasReinforced)
		return false;
	if (unit.strength >= 10)
		return false;
		
	return true;
}
GameRules.canReinforce = function(unit) { return canReinforce(unit);}

function canMount(unit)
{
	if (isGround(unit) && unit.transport !== null)
		return true;
		
	return false;
}
GameRules.canMount = function(unit) { return canMount(unit);}

function isAir(unit)
{
	if (unit.unitData().movmethod === 5) { return true; }
	return false;
}

function isSea(unit)
{
	if((unit.unitData().movmethod === 6) ||
	   (unit.unitData().movmethod === 10))
	{ 
		return true; 
	}
	
	return false;
}

function isGround(unit)
{
	if ((unit.unitData().movmethod < 5) ||
	    (unit.unitData().movmethod === 8) ||
	    (unit.unitData().movmethod === 9))
	{
		return true;
	}
}

GameRules.unitUsesFuel = function(unit)
{
	//TODO check: If fuel is defined as 0 in equipment then it means it doesn't use fuel ??
	if (unit.unitData().fuel === 0)
		return false;
		
	m = unit.unitData().movmethod;
	if ((m == movMethod.leg) || 
		(m == movMethod.towed) ||
		(m == movMethod.allTerrainLeg))
			return false;
	return true;
}

//Returns aproximate cardinal directions x row, y col
GameRules.getDirection = function(x1, y1, x2, y2)
{
	
	var dx = x1 - x2;
	var dy = y1 - y2;
	var delta = 0; //Gets added or substracted from a ordinal direction to get subdivisions
	var r = 1; 
	//Aproximate the 8 sub-ordinal directions
	if (dx != 0) 
		 r = Math.abs(dy / dx);
	
	if (r > 3) 
		delta = 1;
	if (r < 1)
		delta = -1;

	if (dx > 0)
	{
		if (dy > 0)
			return direction.NW + delta; //+ 1 WNW, -1 NNW
		if (dy < 0)
			return direction.NE //+1 ENE, -1 NNE
		if (dy == 0)
			return direction.N;
	}
	if (dx < 0)
	{
		if (dy > 0)
			return direction.SW; //+1 WSW, -1 SSW
		if (dy < 0)
			return direction.SE; //+1 ESE, -1 SSE
		if (dy == 0)
			return direction.S;
	}	
	if (dx == 0)
	{
		if (dy >= 0)
			return direction.W;
		if (dy < 0)
			return direction.E;
	}
}

//Returns the distance between 2 hexes x row, y col
GameRules.distance = function(x1, y1, x2, y2)
{
	var d = 0;
	//shift the entire hexgrid to be arranged diagonally
	if (y1 % 2)	{ x1 = x1 * 2 + 1;	}
	else { 	x1 = x1 * 2; }
	
	if (y2 % 2) { x2 = x2 * 2 + 1;	}
	else { x2 = x2 * 2; }
	
	var dx = Math.abs(x2-x1);
	var dy = Math.abs(y2-y1);
	
	if (dx > dy) { d = parseInt((dx - dy)/2) + dy; }
	else { d = dy } 

	return d;
}

//Checks if 2 coordonates are adjacent x row, y col
function isAdjacent(x1, y1, x2, y2)
{
	if ((x1 - 1 + (y1 % 2) == x2) && (y1 - 1 == y2)) return true;
	if ((x1 + (y1 % 2) == x2) && (y1 - 1 == y2)) return true;
	if ((x1 - 1 == x2) && (y1 == y2)) return true;
	if ((x1 + 1 == x2) && (y1 == y2)) return true;
	if ((x1 - 1 + (y1 % 2) == x2) && (y1 + 1 == y2)) return true;
	if ((x1 + (y1 % 2) == x2) && (y1 + 1 == y2)) return true;
	
	return false;
}

//Returns a list of cells that are in a certain range to another cell
function getCellsInRange(row, col, range, mrows, mcols)
{
	var cellList = [];
	var cell = null;
	
	if ( range <= 0) return cellList;
	
	var minRow = row - range;
	var maxRow = row + range;
	if (minRow < 0) { minRow = 0; }
	if (maxRow >= mrows) { maxRow = mrows-1; }

	//the column
	for (var i = minRow; i <= maxRow; i++)
	{
		if (i != row) 
		{ 
			cell = new Cell(i, col); 
			cell.range = Math.abs(row - i);
			cellList.push(cell);
		}
	}
	//the rows around
	for (var colOff = 1; colOff <= range; colOff++)
	{
		//rows have a ripple effect
		if ((col + colOff) % 2 == 1) 
		{ 
			if (maxRow > 0) { maxRow--; }
		}
		else 
		{ 
			if (minRow < mrows) { minRow++; }
		}
		for (var i = minRow; i <= maxRow; i++)
		{
			if ((col + colOff) < mcols) 
			{
				cell = new Cell(i, col + colOff);
				cell.range = colOff;
				cellList.push(cell);
			}
			
			if ((col - colOff) > 0) 
			{ 
				cell = new Cell(i, col - colOff);
				cell.range = colOff;
				cellList.push(cell);
			}
		}
	}
	return cellList;
}

