import _ from "lodash";
import React from "react";
import AsyncCreatableSelect from "react-select/async-creatable";

import { ContactsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { AddressOption, avatarInitial, stringToColor } from "../../util/send.ts";
import { formatAddress } from "../../util/string.ts";

interface IContactSelectProps {
  id: string;
  value: AddressOption[];
  onChange: (value: AddressOption[]) => void;
}

const loadOptions = async (inputValue: string): Promise<AddressOption[]> => {
  const addrs = await ContactsService.SearchContacts(inputValue);
  return _.map(addrs, (addr) => ({
    value: addr,
    label: formatAddress(addr),
  }));
};

const formatOptionLabel = (option: AddressOption) => {
  const email = option.value?.email || option.label || "";
  const name = option.value?.name || "";
  return (
    <span className="recip-label">
      <span className="av" style={{ background: stringToColor(email) }}>
        {avatarInitial(name || email)}
      </span>
      <span className="em">{name ? `${name} <${email}>` : email}</span>
    </span>
  );
};

export default function ContactSelect({ id, value, onChange }: IContactSelectProps) {
  return (
    <AsyncCreatableSelect
      isMulti
      cacheOptions
      defaultOptions
      loadOptions={loadOptions}
      id={id}
      classNamePrefix="react-select"
      placeholder=""
      formatOptionLabel={formatOptionLabel}
      value={value}
      onChange={(selected) => onChange((selected || []) as AddressOption[])}
      onCreateOption={(created: string) => {
        onChange([...value, {
          label: created,
          value: new Address({
            name: "",
            email: created,
          }),
        }]);
      }}
    />
  );
}
