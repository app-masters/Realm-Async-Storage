// @flow
import Realm from 'realm';

declare interface Storage {
    setup (schemas: Array<RealmSchema>): any;
    createItem (key: string, value: Object): Object;
    updateItem (key: string, value: Object): Object;
    deleteItem (item: RealmObject): Promise<void>;
    getItems (key: string, filter: Object | string): Promise<Array<Object> | null>;
    removeAll (key: string): Promise<void>;
    convertFilter (filter: Object | string): string;
    checkSchema (key: string): void;
    getAllKeys (): Promise<Array<string>>;
    getModel (): any;
}

class RealmStorage {
    // Statics of Storage Class
    static realm: RealmInstance; // Instance of Realm
    static schemas: Array<RealmSchema>; // Array of defined schemas
    static schemaNames: Array<string>; // Array of name of Schemas
    static errorCallback: ?(error: Error) => void; // Callback called on storage uncaught errors
    static primaryKeys: { [any]: ?string }; // Callback called on storage uncaught errors

    /**
     * Setup schemas for Realm, saving a list of names and open a src
     * @param schemas
     * @param version
     * @param migration
     * @param errorCallback
     * @returns {Promise<void>}
     */
    static setup (schemas: Array<RealmSchema>, version: number, migration: Function, errorCallback?: (error: Error) => void): void {
        // Schemas
        RealmStorage.schemas = schemas;
        RealmStorage.schemaNames = RealmStorage.schemas.map(schema => schema.name);

        // List the primaryKey of each schema
        RealmStorage.primaryKeys = {};
        for (const schema of schemas) {
            RealmStorage.primaryKeys[schema.name] = schema.primaryKey;
        }

        // Define callback called on errors
        RealmStorage.errorCallback = errorCallback;

        // Empty migration
        const defaultMigration = () => {};

        // Opening a Realm instance
        RealmStorage.realm = new Realm({
            schema: RealmStorage.schemas,
            schemaVersion: version || 1,
            migration: migration || defaultMigration
        });
    }

    /**
     * Create a new register on given key
     * @param key - Must be a valid schema name
     * @param value
     * @returns {Promise<RealmObject>}
     */
    static async createItem (key: string, value: Object | RealmObject): RealmObject {
        try {
            // Check if it's a valid schema
            RealmStorage.checkSchema(key);

            // Creating new register on src
            let item = null;
            RealmStorage.realm.write(() => {
                item = RealmStorage.realm.create(key, value);
            });
            return item;
        } catch (error) {
            this.onUncaught(error);
            throw new Error(error);
        }
    }

    /**
     * Merge incoming object with already existing with the same primaryKey
     * @param key - Must be a valid schema name
     * @param value
     * @returns {Promise<RealmObject>}
     */
    static async updateItem (key: string, value: Object | RealmObject): RealmObject {
        try {
            // Check if it's a valid schema
            RealmStorage.checkSchema(key);

            // Updating register on src
            let item = [];
            RealmStorage.realm.write(() => {
                const updating = true;
                item = RealmStorage.realm.create(key, value, updating);
            });
            return item;
        } catch (error) {
            this.onUncaught(error);
            throw new Error(error);
        }
    }

    /**
     * Delete given item from storage
     * @param item - Item must by a RealmObject
     * @returns {Promise<null>}
     */
    static async deleteItem (item: RealmObject): Promise<void> {
        try {
            // Deleting register on src
            RealmStorage.realm.write(() => {
                RealmStorage.realm.delete(item);
            });
        } catch (error) {
            this.onUncaught(error);
            throw new Error(error);
        }
    }

    /**
     * Get all items of a given key. A optional parameter filter can select a set of Items
     * @param key - Must be a valid schema name
     * @param filter [optional]
     * @returns {Promise<RealmObjectsList | null>}
     */
    static async getItems (key: string, filter: Object | string): Promise<RealmObjectsList | null> {
        try {
            // Check if it's a valid schema
            RealmStorage.checkSchema(key);

            let data = null;
            if (!filter) {
                // Without filter, returning all objects on the table
                data = RealmStorage.realm.objects(key);
            } else {
                // With filter, returning only filtered results
                data = RealmStorage.realm.objects(key).filtered(RealmStorage.convertFilter(filter));
            }

            // Returning null if not found
            if (data) {
                return data;
            } else {
                return null;
            }
        } catch (error) {
            this.onUncaught(error);
            throw new Error(error);
        }
    }

    /**
     * Deleting all registers of a given key. If no key is defined, delete everything
     * @param key [optional] - Must be a valid schema name
     * @returns {Promise<null>}
     */
    static async removeAll (key: string): Promise<void> {
        try {
            if (key) {
                // Check if it's a valid schema
                RealmStorage.checkSchema(key);

                // With a valid key, delete everything of given key
                const data = RealmStorage.realm.objects(key);
                if (data) {
                    RealmStorage.realm.write(() => {
                        RealmStorage.realm.delete(data);
                    });
                }
            } else {
                // Without key, delete everything of each defined schema
                for (let name of RealmStorage.schemaNames) {
                    const data = RealmStorage.realm.objects(name);
                    if (data) {
                        RealmStorage.realm.write(() => {
                            RealmStorage.realm.delete(data);
                        });
                    }
                }
            }
        } catch (error) {
            this.onUncaught(error);
            throw new Error(error);
        }
    }

    /**
     * Convert query for Realm format
     * If a string is given, it will return query for find objects with the given parameter
     * @param filter -  Can be string or object
     * @returns {string}
     */
    static convertFilter (filter: Object | string): string {
        let query = [];
        if (typeof(filter) === 'string') {
            // If it's not a object, find object with this parameter
            return filter;
        } else {
            // If it's a object, create query string
            for (const key of Object.keys(filter)) {
                query.push(`${key} = ${filter[key]}`);
            }
            return query.join(' AND ');
        }
    }

    /**
     * Check if given key is on the list of schemas
     * @param key
     */
    static checkSchema (key: string) {
        if (RealmStorage.schemaNames.indexOf(key) < 0) {
            throw new Error(`Schema for ${key} it's not defined.`);
        }
    }

    /**
     * Returning keys as promise to match the AsyncStorage format
     * @returns {Promise<Array<string>>}
     */
    static async getAllKeys (): Promise<Array<string>> {
        return RealmStorage.schemaNames;
    }

    /**
     * Get the static Realm instance. Use the instance just for special cases and complex queries
     * @returns {Realm}
     */
    static getModel (): RealmInstance {
        return RealmStorage.realm;
    }

    /**
     * Method for unexpected errors. Define a errorCallback for a custom error solution
     * @param error
     */
    static onUncaught (error: Error): void {
        if (RealmStorage.errorCallback) {
            RealmStorage.errorCallback(error);
        } else {
            console.error('-------- ERROR CALLBACK NOT DEFINED ON STORAGE CLASS --------');
            console.error(error);
        }
    }
}

export default RealmStorage;