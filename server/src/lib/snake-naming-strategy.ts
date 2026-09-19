/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm'
import { snakeCase } from 'typeorm/util/StringUtils'

// Vendored from typeorm-naming-strategies 4.1.0 (MIT, Toni Villena,
// https://github.com/tonivj5/typeorm-naming-strategies), which only declares
// TypeORM 0.2/0.3 as a peer. Every table, column and join name in the
// migrations depends on this exact behaviour, so keep it unchanged.
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
	tableName(className: string, customName: string): string {
		return customName ? customName : snakeCase(className)
	}

	columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
		return snakeCase(embeddedPrefixes.concat('').join('_')) + (customName ? customName : snakeCase(propertyName))
	}

	relationName(propertyName: string): string {
		return snakeCase(propertyName)
	}

	joinColumnName(relationName: string, referencedColumnName: string): string {
		return snakeCase(relationName + '_' + referencedColumnName)
	}

	joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string, _secondPropertyName: string): string {
		return snakeCase(firstTableName + '_' + firstPropertyName.replace(/\./gi, '_') + '_' + secondTableName)
	}

	joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
		return snakeCase(tableName + '_' + (columnName ? columnName : propertyName))
	}

	classTableInheritanceParentColumnName(parentTableName: string, parentTableIdPropertyName: string): string {
		return snakeCase(parentTableName + '_' + parentTableIdPropertyName)
	}

	eagerJoinRelationAlias(alias: string, propertyPath: string): string {
		return alias + '__' + propertyPath.replace('.', '_')
	}
}
