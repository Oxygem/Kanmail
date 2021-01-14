import _ from 'lodash';
import moment from 'moment';


export function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


export function lowercaseFirstLetter(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}


export function formatDate(date) {
    return moment(date).calendar(null, {sameElse: 'DD/MM/YYYY'});
}


export function formatAddress(address, short=false) {
    if (short) {
        let name = address[1];

        if (address[0]) {
            const nameBits = address[0].split(' ');
            if (nameBits[0] === 'The') {
                return name = address[0];
            }
            name = nameBits[0];
        }

        return _.trim(name, ',');
    }

    if (address[0]) {
        return `${address[0]} (${address[1]})`;
    }

    return address[1];
}
