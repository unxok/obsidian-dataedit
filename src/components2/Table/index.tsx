import {
  DataviewLink,
  DataviewPropertyValue,
  DataviewQueryResultValues,
  PropertyType,
} from "@/lib/types";
import { createEffect, createMemo, For } from "solid-js";
import { PropertyHeader, PropertyData } from "../Property";
import { useBlock } from "../CodeBlock";
import { checkIfDataviewLink } from "@/lib/util";

export const Table = (props: {
  properties: string[];
  headers: string[];
  values: DataviewQueryResultValues;
  propertyTypes: PropertyType[];
  idColIndex: number;
}) => {
  const getFilePath = (rowIndex: number) => {
    const fileColValue = props.values[rowIndex][props.idColIndex];

    let filePath = "";
    if (checkIfDataviewLink(fileColValue)) {
      filePath = (fileColValue as DataviewLink).path;
    }
    return filePath;
  };

  return (
    <table style={{ width: "fit-content" }}>
      <thead>
        <tr>
          <For each={props.properties}>
            {(item, index) => (
              <th>
                <PropertyHeader header={item} property={item} />
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={props.values}>
          {(row, rowIndex) => (
            <tr>
              <For each={row}>
                {(item, itemIndex) => (
                  <td>
                    <PropertyData
                      property={props.properties[itemIndex()]}
                      value={item}
                      propertyType={props.propertyTypes[itemIndex()]}
                      header={props.headers[itemIndex()]}
                      filePath={getFilePath(rowIndex())}
                    />
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
};
